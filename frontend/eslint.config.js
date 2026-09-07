import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const hooksFlat = reactHooks.configs.flat.recommended;

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    ...hooksFlat,
    rules: {
      ...hooksFlat.rules,
      // React Compiler 时代的规则组: 本项目未启用 React Compiler,
      // 降级为 warn, 保留提示但不阻塞开发.
      "react-hooks/config": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
);
