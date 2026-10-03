import type { NativeScrollEvent, NativeSyntheticEvent, View } from "react-native";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import type { CaretRect, RichEditorHandle } from "./types";

export interface VisibleBand {
  ceiling: number;
  floor: number;
}

export class EditorBridge {
  handle: RichEditorHandle | null = null;
  private scroll: KeyboardAwareScrollViewRef | null = null;
  private body: View | null = null;
  private offset = 0;
  private caret: CaretRect | null = null;

  attachHandle = (handle: RichEditorHandle | null) => {
    this.handle = handle;
  };

  attachScroll = (scroll: KeyboardAwareScrollViewRef | null) => {
    this.scroll = scroll;
  };

  attachBody = (body: View | null) => {
    this.body = body;
  };

  onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    this.offset = event.nativeEvent.contentOffset.y;
  };

  setCaret(caret: CaretRect) {
    this.caret = caret;
  }

  reveal(band: VisibleBand) {
    const caret = this.caret;
    if (!caret || !this.body) return;
    this.body.measureInWindow((_x, y) => {
      const top = y + caret.top;
      const bottom = y + caret.bottom;
      const delta =
        bottom > band.floor ? bottom - band.floor : top < band.ceiling ? top - band.ceiling : 0;
      if (Math.abs(delta) < 1) return;
      this.scroll?.scrollTo({ y: Math.max(0, this.offset + delta), animated: true });
    });
  }
}
