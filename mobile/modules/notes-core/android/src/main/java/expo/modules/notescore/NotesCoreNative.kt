package expo.modules.notescore

object NotesCoreNative {
  init {
    System.loadLibrary("notes_again_mobile")
  }

  @JvmStatic external fun start(databasePath: String, secret: String): Int

  @JvmStatic external fun stop()

  @JvmStatic external fun lastError(): String
}
