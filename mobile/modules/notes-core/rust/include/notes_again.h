#include <stdint.h>

uint16_t notes_again_start(const char *db_path, const char *secret);
void notes_again_stop(void);
char *notes_again_last_error(void);
void notes_again_free_string(char *ptr);
