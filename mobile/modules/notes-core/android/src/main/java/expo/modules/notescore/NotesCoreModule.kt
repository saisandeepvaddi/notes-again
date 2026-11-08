package expo.modules.notescore

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class NotesCoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NotesCore")

    Constant("dataDirectory") {
      val context = appContext.reactContext ?: throw CodedException("The app context isn't ready.")
      File(context.filesDir, "notes-again").absolutePath
    }

    AsyncFunction("start") { databasePath: String, secret: String ->
      val port = NotesCoreNative.start(databasePath, secret)
      if (port == 0) {
        val message = NotesCoreNative.lastError()
        throw CodedException(if (message.isEmpty()) "The notes server didn't start." else message)
      }
      port
    }

    AsyncFunction("stop") {
      NotesCoreNative.stop()
    }
  }
}
