#include "file_io.h"
#include <stdio.h>
#include <stdlib.h>

int buffer_load(Buffer *buf, const char *filename) {
    FILE *f = fopen(filename, "r");
    if (!f) return -1;

    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);

    char *temp = malloc(fsize);
    fread(temp, 1, fsize, f);
    buffer_insert(buf, temp, fsize);
    free(temp);

    fclose(f);
    buf->modified = 0; // reset modified after initial load
    return 0;
}

int buffer_save(Buffer *buf, const char *filename) {
    FILE *f = fopen(filename, "w");
    if (!f) return -1;

    for (size_t i = 0; i < buf->gap_start; i++) {
        fputc(buf->data[i], f);
    }
    for (size_t i = buf->gap_end; i < buf->size; i++) {
        fputc(buf->data[i], f);
    }

    fclose(f);
    return 0;
}
