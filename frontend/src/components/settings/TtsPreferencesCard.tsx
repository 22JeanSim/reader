import { TtsEngineControls } from "@/components/reader/SettingsPanel";
import { SettingCard } from "@/components/ui";

/**
 * 朗读与音色卡: 独立于阅读偏好的视觉块 —— TTS 引擎选择/音色/网关与密钥配置内容量大,
 * 混在偏好行里会被折叠感埋没; 与阅读器浮动面板同源 (settings-store + 网关清单).
 */
export function TtsPreferencesCard() {
  return (
    <SettingCard
      title="朗读与音色"
      desc="多引擎 TTS 网关聚合自建与云端合成: 选引擎/音色, 密钥与端点就地配置并验证"
    >
      <TtsEngineControls />
    </SettingCard>
  );
}
