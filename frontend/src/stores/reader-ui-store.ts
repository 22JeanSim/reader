import { create } from "zustand";

export interface ReaderUIState {
  /** 目录抽屉 (与设置面板互斥) */
  tocOpen: boolean;
  /** 阅读设置面板 (与目录抽屉互斥) */
  settingsOpen: boolean;
  setTocOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  /** 关闭全部浮层 (Esc / 点击正文) */
  closeAll: () => void;
}

export const useReaderUIStore = create<ReaderUIState>()((set) => ({
  tocOpen: false,
  settingsOpen: false,


  setTocOpen: (open) => {
    set(open ? { tocOpen: true, settingsOpen: false } : { tocOpen: false });
  },

  setSettingsOpen: (open) => {
    set(open ? { settingsOpen: true, tocOpen: false } : { settingsOpen: false });
  },

  closeAll: () => {
    set({ tocOpen: false, settingsOpen: false });
  },
}));
