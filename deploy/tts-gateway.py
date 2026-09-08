#!/usr/bin/env python3
"""多引擎 TTS 网关 v3 (hub 托管, 端口 9912): 引擎/密钥/端点全部运行时可配置.

配置不再依赖 env: 前端「TTS 引擎」区块 per-引擎「配置」按钮 → POST /config 落盘
(网关主机 ~/.local/share/tts-gateway-config.json, 0600); env 仅作首次种子值.
密钥只留网关主机, GET /config 只回掩码值.

端点:
  GET  /health
  GET  /engines            → {gpu, auto, engines:[{id,name,kind,available,reason,gpu,rtf?,setup}]}
  GET  /voices?engine=<id> → [{id,name,gender?}]
  GET  /tts?text=&voice=&engine=<id|auto> → 音频字节
  GET  /config             → 掩码配置视图 {sections:{...masked}, endpoints:{...}}
  POST /config             → body {section:{field:str}} 合并落盘 (空串=清除), 回掩码视图
  POST /test               → body {engine, voice?} 真实合成一段, 回 {ok, ms, error?}

auto 优先级: 自建 (kokoro→cosyvoice→gptsovits, kokoro-onnx 实测 RTF≤1.2 才入)
  → edge (免费云) → tencent → aliyun → volc → generic.
"""
import asyncio
import base64
import datetime
import hashlib
import hmac
import io
import json
import os
import shutil
import subprocess
import time
import uuid
import wave
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote

PORT = 9912
CONFIG_PATH = os.environ.get(
    "TTS_GATEWAY_CONFIG", os.path.expanduser("~/.local/share/tts-gateway-config.json"))
RTF_AUTO_LIMIT = 1.2

DEFAULT_CONFIG: dict = {
    "tencent": {"secret_id": "", "secret_key": ""},
    "aliyun": {"access_key_id": "", "access_key_secret": ""},
    "volc": {"app_id": "", "token": "", "cluster": "volcengine_streaming_common"},
    "endpoints": {
        "kokoro_onnx_dir": os.path.expanduser("~/.local/share/tts-models"),
        "kokoro_url": "http://127.0.0.1:8880",
        "cosyvoice_url": "http://127.0.0.1:9880",
        "gptsovits_url": "http://127.0.0.1:9881",
    },
    "generic_template": "",
}

# env 种子 (首次无配置文件时向后兼容)
_ENV_SEED = {
    "tencent": {"secret_id": os.environ.get("TENCENT_SECRET_ID", ""),
                "secret_key": os.environ.get("TENCENT_SECRET_KEY", "")},
    "aliyun": {"access_key_id": os.environ.get("ALIYUN_ACCESS_KEY_ID", ""),
               "access_key_secret": os.environ.get("ALIYUN_ACCESS_KEY_SECRET", "")},
    "endpoints": {
        "kokoro_onnx_dir": os.environ.get("KOKORO_ONNX_DIR", ""),
        "kokoro_url": os.environ.get("KOKORO_URL", ""),
        "cosyvoice_url": os.environ.get("COSYVOICE_URL", ""),
        "gptsovits_url": os.environ.get("GPT_SOVITS_URL", ""),
    },
    "generic_template": os.environ.get("GENERIC_TTS_TEMPLATE", ""),
}

CFG: dict = json.loads(json.dumps(DEFAULT_CONFIG))


def load_config() -> None:
    global CFG
    CFG = json.loads(json.dumps(DEFAULT_CONFIG))
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding="utf-8") as fh:
                saved = json.load(fh)
            for section, fields in saved.items():
                if isinstance(fields, dict) and section in CFG:
                    for key, val in fields.items():
                        if key in CFG[section]:
                            CFG[section][key] = val
                elif section in CFG and isinstance(fields, str):
                    CFG[section] = fields
        except Exception:  # noqa: BLE001 - 坏配置回退默认
            pass
    else:  # env 种子
        for section, fields in _ENV_SEED.items():
            if isinstance(fields, dict):
                for key, val in fields.items():
                    if val and key in CFG.get(section, {}):
                        CFG[section][key] = val
            elif fields:
                CFG[section] = fields
        save_config()


def save_config() -> None:
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(CFG, fh, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, CONFIG_PATH)


SECRET_FIELDS = {("tencent", "secret_key"), ("aliyun", "access_key_secret"), ("volc", "token")}


def mask(value: str) -> str:
    if not value:
        return ""
    return value[:4] + "****" + value[-4:] if len(value) > 10 else "****"


def masked_config() -> dict:
    out: dict = {"sections": {}, "endpoints": dict(CFG["endpoints"]),
                 "generic_template": CFG["generic_template"]}
    for section in ("tencent", "aliyun", "volc"):
        out["sections"][section] = {
            key: (mask(val) if (section, key) in SECRET_FIELDS else val)
            for key, val in CFG[section].items()
        }
    return out


def apply_config(patch: dict) -> None:
    for section, fields in patch.items():
        if not isinstance(fields, dict):
            if section == "generic_template" and isinstance(fields, str):
                CFG["generic_template"] = fields
            continue
        if section not in CFG or not isinstance(CFG[section], dict):
            continue
        for key, val in fields.items():
            if key in CFG[section] and isinstance(val, str):
                CFG[section][key] = val
    save_config()


_gpu_cache: bool | None = None
_edge_import_ok: bool | None = None
_kokoro_inst = None
_rtf_cache: dict[str, float] = {}
_aliyun_token: dict[str, float | str] = {"id": "", "expire": 0.0}


def has_gpu() -> bool:
    global _gpu_cache
    if _gpu_cache is None:
        _gpu_cache = shutil.which("nvidia-smi") is not None and subprocess.run(
            ["nvidia-smi", "-L"], capture_output=True).returncode == 0
    return _gpu_cache


def http_probe(url: str, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status < 500
    except Exception:  # noqa: BLE001
        return False


def post_json(url: str, payload: dict, timeout: float = 120, headers: dict | None = None) -> bytes:
    hdr = {"Content-Type": "application/json"}
    if headers:
        hdr.update(headers)
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=hdr)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------- 引擎实现: 统一返回 (音频字节, content-type) ----------

def kokoro_onnx_ready() -> bool:
    d = CFG["endpoints"]["kokoro_onnx_dir"]
    return (os.path.exists(os.path.join(d, "kokoro-v1.0.onnx"))
            and os.path.exists(os.path.join(d, "voices-v1.0.bin")))


def kokoro_instance():
    global _kokoro_inst
    if _kokoro_inst is None:
        from kokoro_onnx import Kokoro
        d = CFG["endpoints"]["kokoro_onnx_dir"]
        _kokoro_inst = Kokoro(os.path.join(d, "kokoro-v1.0.onnx"), os.path.join(d, "voices-v1.0.bin"))
    return _kokoro_inst


def synth_kokoro(text: str, voice: str) -> tuple[bytes, str]:
    if kokoro_onnx_ready():
        import numpy as np
        samples, sr = kokoro_instance().create(text, voice=voice or "zm_yunxi", speed=1.0)
        pcm = np.clip(samples, -1.0, 1.0)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((pcm * 32767).astype("<i2").tobytes())
        return buf.getvalue(), "audio/wav"
    data = post_json(f"{CFG['endpoints']['kokoro_url']}/v1/audio/speech",
                     {"input": text, "voice": voice, "response_format": "mp3"})
    return data, "audio/mpeg"


def measure_kokoro_rtf() -> float:
    if "kokoro" in _rtf_cache:
        return _rtf_cache["kokoro"]
    t0 = time.monotonic()
    audio, _ = synth_kokoro(
        "少年踏出村子的那一刻，身后是整个村子的期盼，风从山那边吹来，带着草木与泥土的气息，他回头看了一眼，便再也没有回头。",
        "zm_yunxi")
    dt = time.monotonic() - t0
    rtf = dt / max(len(audio) / (24000 * 2), 0.01)
    _rtf_cache["kokoro"] = rtf
    return rtf


def synth_cosyvoice(text: str, voice: str) -> tuple[bytes, str]:
    return post_json(f"{CFG['endpoints']['cosyvoice_url']}/",
                     {"text": text, "spk": voice, "stream": False}), "audio/mpeg"


def synth_gptsovits(text: str, voice: str) -> tuple[bytes, str]:
    payload = {"text": text, "text_lang": "zh", "text_split_method": "cut5"}
    if voice:
        payload.update({"ref_audio_path": voice, "prompt_lang": "zh"})
    return post_json(f"{CFG['endpoints']['gptsovits_url']}/tts", payload), "audio/mpeg"


def edge_ok() -> bool:
    global _edge_import_ok
    if _edge_import_ok is None:
        try:
            import edge_tts  # noqa: F401
            _edge_import_ok = True
        except Exception:  # noqa: BLE001
            _edge_import_ok = False
    return _edge_import_ok


def synth_edge(text: str, voice: str) -> tuple[bytes, str]:
    import edge_tts

    async def run() -> bytes:
        chunks: list[bytes] = []
        async for c in edge_tts.Communicate(text, voice).stream():
            if c["type"] == "audio":
                chunks.append(c["data"])
        return b"".join(chunks)

    return asyncio.run(run()), "audio/mpeg"


def _tencent_sign(payload: str, date: str, timestamp: int) -> dict:
    def hmac_sha256(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    secret = CFG["tencent"]["secret_key"]
    ident = CFG["tencent"]["secret_id"]
    algo = "TC3-HMAC-SHA256"
    ct = "application/json; charset=utf-8"
    canonical = (f"POST\n/\n\ncontent-type:{ct}\nhost:tts.tencentcloudapi.com\n\n"
                 f"content-type;host\n{hashlib.sha256(payload.encode()).hexdigest()}")
    scope = f"{date}/tts/tc3_request"
    string = f"{algo}\n{timestamp}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}"
    k_date = hmac_sha256(("TC3" + secret).encode(), date)
    k_service = hmac_sha256(k_date, "tts")
    k_signing = hmac_sha256(k_service, "tc3_request")
    sig = hmac.new(k_signing, string.encode(), hashlib.sha256).hexdigest()
    return {
        "Authorization": f"{algo} Credential={ident}/{scope}, SignedHeaders=content-type;host, Signature={sig}",
        "Content-Type": ct, "Host": "tts.tencentcloudapi.com",
        "X-TC-Action": "TextToVoice", "X-TC-Version": "2019-08-23",
        "X-TC-Timestamp": str(timestamp), "X-TC-Region": "ap-guangzhou",
    }


def synth_tencent(text: str, voice: str) -> tuple[bytes, str]:
    now = datetime.datetime.now(datetime.timezone.utc)
    ts = int(now.timestamp())
    date = now.strftime("%Y-%m-%d")
    payload = json.dumps({"Text": text, "SessionId": "reader", "VoiceType": int(voice or 101001),
                          "Codec": "mp3", "Speed": 0, "Volume": 0})
    req = urllib.request.Request("https://tts.tencentcloudapi.com", data=payload.encode(),
                                 headers=_tencent_sign(payload, date, ts))
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read())
    audio = body.get("Response", {}).get("Audio")
    if not audio:
        raise RuntimeError(json.dumps(body.get("Response", {}), ensure_ascii=False)[:200])
    return base64.b64decode(audio), "audio/mpeg"


def _aliyun_rpc_url(params: dict[str, str]) -> str:
    def enc(s: str) -> str:
        return quote(s, safe="~")

    common = {
        "Format": "JSON", "Version": "2019-02-21", "AccessKeyId": CFG["aliyun"]["access_key_id"],
        "SignatureMethod": "HMAC-SHA1",
        "Timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "SignatureVersion": "1.0", "SignatureNonce": uuid.uuid4().hex,
    }
    allp = {**common, **params}
    canon = "&".join(f"{enc(k)}={enc(str(v))}" for k, v in sorted(allp.items()))
    string = f"GET&{enc('/')}&{enc(canon)}"
    sig = base64.b64encode(hmac.new((CFG["aliyun"]["access_key_secret"] + "&").encode(),
                                    string.encode(), hashlib.sha1).digest()).decode()
    return f"https://nls-meta.cn-shanghai.aliyuncs.com/?{canon}&Signature={enc(sig)}"


def aliyun_token() -> str:
    cached_id = _aliyun_token["id"]
    if cached_id and time.time() < float(_aliyun_token["expire"]) - 60:
        return str(cached_id)
    with urllib.request.urlopen(
            _aliyun_rpc_url({"Action": "CreateToken", "RegionId": "cn-shanghai"}), timeout=30) as resp:
        body = json.loads(resp.read())
    token = body.get("Token", {})
    if not token.get("Id"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:200])
    _aliyun_token["id"] = str(token["Id"])
    _aliyun_token["expire"] = float(token.get("ExpireTime", time.time() + 3600))
    return str(_aliyun_token["id"])


def synth_aliyun(text: str, voice: str) -> tuple[bytes, str]:
    payload = json.dumps({
        "text": text, "voice": voice or "zhiqi_emo", "format": "mp3",
        "sample_rate": 24000, "volume": 50, "speech_rate": 0, "pitch_rate": 0,
    }).encode()
    req = urllib.request.Request(
        "https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts", data=payload,
        headers={"Content-Type": "application/json", "X-NLS-Token": aliyun_token()})
    with urllib.request.urlopen(req, timeout=60) as resp:
        ctype = resp.headers.get("Content-Type", "")
        data = resp.read()
    if "audio" not in ctype and "octet-stream" not in ctype:
        raise RuntimeError(data.decode(errors="replace")[:200])
    return data, "audio/mpeg"


def synth_volc(text: str, voice: str) -> tuple[bytes, str]:
    """火山引擎语音技术 v1 HTTP (appid/token/cluster, Authorization: Bearer; token)."""
    volc = CFG["volc"]
    payload = {
        "app": {"appid": volc["app_id"], "token": volc["token"], "cluster": volc["cluster"]},
        "user": {"uid": "reader-dev"},
        "audio": {"voice": voice or "BV001_streaming", "format": "mp3", "sample_rate": 24000},
        "request": {"reqid": uuid.uuid4().hex, "text": text, "operation": "query"},
    }
    data = post_json("https://openspeech.bytedance.com/api/v1/tts", payload,
                     headers={"Authorization": f"Bearer; {volc['token']}"})
    body = json.loads(data)
    audio = body.get("data")
    if not audio:
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:200])
    return base64.b64decode(audio), "audio/mpeg"


def synth_generic(text: str, voice: str) -> tuple[bytes, str]:
    template = CFG["generic_template"]
    url = template.replace("{text}", quote(text[:500])).replace("{voice}", quote(voice))
    if "{voice}" not in template:
        url += ("&" if "?" in url else "?") + "voice=" + quote(voice)
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read(), "audio/mpeg"


ENGINES: list[dict] = [
    {"id": "kokoro", "name": "Kokoro (自建·ONNX)", "kind": "self-hosted",
     "synth": synth_kokoro,
     "probe": lambda: kokoro_onnx_ready() or http_probe(f"{CFG['endpoints']['kokoro_url']}/v1/models"),
     "setup": "配置模型目录 (kokoro-v1.0.onnx + voices-v1.0.bin) 或 Kokoro-FastAPI 端点",
     "config_fields": [("endpoints.kokoro_onnx_dir", "模型目录 (含 kokoro-v1.0.onnx)"),
                       ("endpoints.kokoro_url", "Kokoro-FastAPI 端点 (无模型时代理)")],
     "voices": [("zm_yunxi", "中文·男·叙述"), ("zf_xiaoxiao", "中文·女·暖"),
                ("zm_yunjian", "中文·男·沉"), ("zm_yunyang", "中文·男·播报"),
                ("zf_xiaobei", "中文·女·东北"), ("am_adam", "英文·男"), ("af_heart", "英文·女")]},
    {"id": "cosyvoice", "name": "CosyVoice (自建·流式)", "kind": "self-hosted",
     "synth": synth_cosyvoice, "probe": lambda: http_probe(f"{CFG['endpoints']['cosyvoice_url']}/"),
     "setup": "配置 CosyVoice server 端点",
     "config_fields": [("endpoints.cosyvoice_url", "CosyVoice server 端点")],
     "voices": [("中文女", "中文·女"), ("中文男", "中文·男"), ("粤语女", "粤语·女")]},
    {"id": "gptsovits", "name": "GPT-SoVITS (自建·克隆)", "kind": "self-hosted",
     "synth": synth_gptsovits, "probe": lambda: http_probe(f"{CFG['endpoints']['gptsovits_url']}/"),
     "setup": "配置 api_v2.py 端点 (voice 传 ref_audio_path)",
     "config_fields": [("endpoints.gptsovits_url", "GPT-SoVITS api_v2 端点")],
     "voices": [("", "默认参考音")]},
    {"id": "edge", "name": "edge-tts (免费云·神经音)", "kind": "cloud-free",
     "synth": synth_edge, "probe": edge_ok, "setup": "网关内置, 无需配置",
     "config_fields": [], "voices": None},
    {"id": "tencent", "name": "腾讯云 TTS (密钥云)", "kind": "cloud-keyed",
     "synth": synth_tencent,
     "probe": lambda: bool(CFG["tencent"]["secret_id"] and CFG["tencent"]["secret_key"]),
     "setup": "控制台 CAM 取 API 密钥 + 开通语音合成, 在「配置」里填写",
     "config_fields": [("tencent.secret_id", "SecretId"), ("tencent.secret_key", "SecretKey")],
     "voices": [("101001", "智瑜·女"), ("101002", "智聆·女"), ("101003", "智美·女"),
                ("101006", "智宝龙·男"), ("101007", "智馨·女"), ("101050", "智悠·男·叙述")]},
    {"id": "aliyun", "name": "阿里云 TTS (密钥云)", "kind": "cloud-keyed",
     "synth": synth_aliyun,
     "probe": lambda: bool(CFG["aliyun"]["access_key_id"] and CFG["aliyun"]["access_key_secret"]),
     "setup": "RAM 取 AccessKey + 开通智能语音交互, 在「配置」里填写",
     "config_fields": [("aliyun.access_key_id", "AccessKeyId"),
                       ("aliyun.access_key_secret", "AccessKeySecret")],
     "voices": [("zhiqi_emo", "智琪·女·情感"), ("zhitian_emo", "智甜·女·甜"),
                ("zhichu_emo", "智初·女·清"), ("ruoxi", "若曦·女·温柔"),
                ("siyue", "思悦·女·播报"), ("zhiqian", "智倩·女·知性")]},
    {"id": "volc", "name": "火山引擎 TTS (密钥云)", "kind": "cloud-keyed",
     "synth": synth_volc,
     "probe": lambda: bool(CFG["volc"]["app_id"] and CFG["volc"]["token"]),
     "setup": "控制台语音技术取 APPID/Access Token, 在「配置」里填写",
     "config_fields": [("volc.app_id", "APPID"), ("volc.token", "Access Token"),
                       ("volc.cluster", "cluster")],
     "voices": [("BV001_streaming", "通用·女"), ("BV002_streaming", "通用·男"),
                ("BV005_streaming", "甜·女"), ("BV100_streaming", "沉·男")]},
    {"id": "generic", "name": "自定义模板 (任意 HTTP 源)", "kind": "cloud-keyed",
     "synth": synth_generic, "probe": lambda: bool(CFG["generic_template"]),
     "setup": "配置 legado 式模板 (含 {text}/{voice})",
     "config_fields": [("generic_template", "URL 模板")],
     "voices": [("", "模板内置")]},
]

DEFAULT_VOICE = {"kokoro": "zm_yunxi", "cosyvoice": "中文男", "gptsovits": "",
                 "edge": "zh-CN-YunxiNeural", "tencent": "101050", "aliyun": "zhiqi_emo",
                 "volc": "BV001_streaming", "generic": ""}


def engine_states() -> list[dict]:
    gpu = has_gpu()
    out = []
    for e in ENGINES:
        try:
            avail = bool(e["probe"]())
            reason = "" if avail else ("未配置" if e["kind"] == "cloud-keyed" else "未部署/未探测到")
        except Exception as exc:  # noqa: BLE001
            avail, reason = False, str(exc)[:80]
        item = {"id": e["id"], "name": e["name"], "kind": e["kind"], "available": avail,
                "reason": reason, "gpu": gpu, "setup": e["setup"],
                "config_fields": [{"key": k, "label": l,
                                   "secret": (k.split(".")[0], k.split(".")[-1]) in SECRET_FIELDS
                                   or k.split(".")[-1] in ("secret_key", "access_key_secret", "token"),
                                   "value": _field_value(k)}
                                  for k, l in e["config_fields"]]}
        if e["id"] == "kokoro" and avail and kokoro_onnx_ready():
            item["rtf"] = round(measure_kokoro_rtf(), 2)
        out.append(item)
    return out


def _field_value(key: str) -> str:
    if key == "generic_template":
        return CFG["generic_template"]
    section, field = key.split(".", 1)
    val = CFG.get(section, {}).get(field, "")
    return mask(val) if (section, field) in SECRET_FIELDS else val


def auto_engine() -> str:
    states = {s["id"]: s for s in engine_states()}
    for eid in ["kokoro", "cosyvoice", "gptsovits"]:
        st = states.get(eid)
        if not st or not st["available"]:
            continue
        if eid == "kokoro" and st.get("rtf", 0) > RTF_AUTO_LIMIT:
            continue
        return eid
    for eid in ["edge", "tencent", "aliyun", "volc", "generic"]:
        if states.get(eid, {}).get("available"):
            return eid
    return "edge"


def voices_of(engine_id: str) -> list[dict]:
    e = next((x for x in ENGINES if x["id"] == engine_id), None)
    if e is None:
        return []
    if e["voices"] is None:
        import edge_tts
        raw = asyncio.run(edge_tts.list_voices())
        return [{"id": v["ShortName"], "name": f"{v['ShortName']} · {v.get('Gender', '')}",
                 "gender": v.get("Gender", "")} for v in raw]
    return [{"id": i, "name": n} for i, n in e["voices"]]


def engine_by_id(engine_id: str) -> dict | None:
    return next((x for x in ENGINES if x["id"] == engine_id), None)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # 静音
        pass

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, obj: dict | list, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json")

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw or b"{}")
            return data if isinstance(data, dict) else {}
        except Exception:  # noqa: BLE001
            return {}

    def do_OPTIONS(self):
        # CORS 预检: 浏览器 POST application/json 必先发 OPTIONS, 缺此处理则 501 挡掉全部配置/验证请求
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/config":
            patch = self._body()
            apply_config(patch)
            self._send_json(masked_config())
        elif parsed.path == "/test":
            body = self._body()
            engine_id = body.get("engine", "auto")
            if engine_id == "auto":
                engine_id = auto_engine()
            engine = engine_by_id(engine_id)
            if engine is None:
                self._send_json({"ok": False, "error": "unknown engine"}, 404)
                return
            voice = body.get("voice") or DEFAULT_VOICE.get(engine_id, "")
            t0 = time.monotonic()
            try:
                engine["synth"]("配置验证：合成测试。", voice)
                self._send_json({"ok": True, "ms": int((time.monotonic() - t0) * 1000)})
            except Exception as exc:  # noqa: BLE001
                self._send_json({"ok": False, "error": str(exc)[:300]})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if parsed.path == "/health":
            self._send(200, b"ok", "text/plain")
        elif parsed.path == "/engines":
            self._send_json({"gpu": has_gpu(), "auto": auto_engine(), "engines": engine_states()})
        elif parsed.path == "/config":
            self._send_json(masked_config())
        elif parsed.path == "/voices":
            self._send_json(voices_of((qs.get("engine") or ["edge"])[0]))
        elif parsed.path == "/tts":
            text = (qs.get("text") or [""])[0].strip()
            engine_id = (qs.get("engine") or ["auto"])[0]
            if engine_id == "auto":
                engine_id = auto_engine()
            voice = (qs.get("voice") or [DEFAULT_VOICE.get(engine_id, "")])[0]
            if not text:
                self._send(400, b"missing text", "text/plain")
                return
            engine = engine_by_id(engine_id)
            if engine is None:
                self._send(404, b"unknown engine", "text/plain")
                return
            try:
                audio, ctype = engine["synth"](text, voice)
            except Exception as exc:  # noqa: BLE001
                self._send(502, f"{engine_id}: {exc}".encode()[:400], "text/plain")
                return
            self._send(200, audio, ctype)
        else:
            self._send(404, b"not found", "text/plain")


if __name__ == "__main__":
    load_config()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
