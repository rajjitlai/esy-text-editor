#ifndef FILE_IO_H
#define FILE_IO_H

#include "buffer.h"

int buffer_load(Buffer *buf, const char *filename);
int buffer_save(Buffer *buf, const char *filename);

#endif
