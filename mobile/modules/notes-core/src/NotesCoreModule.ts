import { NativeModule, requireOptionalNativeModule } from "expo";

declare class NotesCoreModule extends NativeModule<Record<string, never>> {
  readonly dataDirectory: string;
  start(databasePath: string, secret: string): Promise<number>;
  stop(): Promise<void>;
}

export default requireOptionalNativeModule<NotesCoreModule>("NotesCore");
