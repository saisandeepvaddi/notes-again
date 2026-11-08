import ExpoModulesCore
import NotesAgainCore

public class NotesCoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotesCore")

    Constant("dataDirectory") {
      FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("notes-again", isDirectory: true).path
    }

    AsyncFunction("start") { (databasePath: String, secret: String) -> Int in
      let port = notes_again_start(databasePath, secret)
      if port == 0 {
        let pointer = notes_again_last_error()
        let message = pointer.map { String(cString: $0) } ?? ""
        notes_again_free_string(pointer)
        throw Exception(name: "NotesCoreStartFailed", description: message.isEmpty ? "The notes server didn't start." : message)
      }
      return Int(port)
    }

    AsyncFunction("stop") {
      notes_again_stop()
    }
  }
}
