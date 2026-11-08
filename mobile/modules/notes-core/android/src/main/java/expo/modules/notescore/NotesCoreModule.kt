package expo.modules.notescore

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.Executors

object NotesServer {
  val secret: String = ByteArray(32).also { SecureRandom().nextBytes(it) }
    .joinToString("") { "%02x".format(it) }

  private val executor = Executors.newSingleThreadExecutor()

  fun warmUp(databasePath: String) {
    executor.execute { NotesCoreNative.start(databasePath, secret) }
  }

  fun start(databasePath: String): Int {
    val port = executor.submit<Int> { NotesCoreNative.start(databasePath, secret) }.get()
    if (port == 0) {
      val message = NotesCoreNative.lastError()
      throw CodedException(if (message.isEmpty()) "The notes server didn't start." else message)
    }
    return port
  }

  fun stop() {
    executor.submit { NotesCoreNative.stop() }.get()
  }
}

class NotesCoreModule : Module() {
  private fun databasePath(): String {
    val context = appContext.reactContext ?: throw CodedException("The app context isn't ready.")
    return File(File(context.filesDir, "notes-again"), "notes-again.db").absolutePath
  }

  override fun definition() = ModuleDefinition {
    Name("NotesCore")

    OnCreate {
      runCatching { NotesServer.warmUp(databasePath()) }
    }

    AsyncFunction("start") {
      mapOf("port" to NotesServer.start(databasePath()), "secret" to NotesServer.secret)
    }

    AsyncFunction("stop") {
      NotesServer.stop()
    }
  }
}
