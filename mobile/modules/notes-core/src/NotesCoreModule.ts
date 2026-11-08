import { NativeModule, requireOptionalNativeModule } from "expo";

declare class NotesCoreModule extends NativeModule<Record<string, never>> {
  start(): Promise<{ port: number; secret: string }>;
  stop(): Promise<void>;
}

export default requireOptionalNativeModule<NotesCoreModule>("NotesCore");
