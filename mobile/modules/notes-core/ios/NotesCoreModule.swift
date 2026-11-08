import ExpoModulesCore
import NotesAgainCore
import Security

final class NotesServer {
  static let shared = NotesServer()

  let secret: String = {
    var bytes = [UInt8](repeating: 0, count: 32)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return bytes.map { String(format: "%02x", $0) }.joined()
  }()

  let databasePath: String = FileManager.default
    .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("notes-again", isDirectory: true)
    .appendingPathComponent("notes-again.db").path

  private let queue = DispatchQueue(label: "notes-again.server")

  func warmUp() {
    queue.async { _ = notes_again_start(self.databasePath, self.secret) }
  }

  func start() throws -> Int {
    let port = queue.sync { notes_again_start(databasePath, secret) }
    if port == 0 {
      let pointer = notes_again_last_error()
      let message = pointer.map { String(cString: $0) } ?? ""
      notes_again_free_string(pointer)
      throw Exception(name: "NotesCoreStartFailed", description: message.isEmpty ? "The notes server didn't start." : message)
    }
    return Int(port)
  }

  func stop() {
    queue.sync { notes_again_stop() }
  }
}

public class NotesCoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotesCore")

    OnCreate {
      NotesServer.shared.warmUp()
    }

    AsyncFunction("start") { () -> [String: Any] in
      let port = try NotesServer.shared.start()
      return ["port": port, "secret": NotesServer.shared.secret]
    }

    AsyncFunction("stop") {
      NotesServer.shared.stop()
    }
  }
}
