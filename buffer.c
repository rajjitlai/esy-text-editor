#include "buffer.h"
#include <stdlib.h>
#include <string.h>

#define INITIAL_GAP_SIZE 1024

Buffer* buffer_create(const char *filename) {
    Buffer *buf = malloc(sizeof(Buffer));
    buf->size = INITIAL_GAP_SIZE;
    buf->data = malloc(buf->size);
    buf->gap_start = 0;
    buf->gap_end = buf->size;
    buf->filename = filename ? strdup(filename) : NULL;
    buf->modified = 0;
    buf->selection_start = 0;
    buf->selecting = 0;
    return buf;
}

void buffer_destroy(Buffer *buf) {
    if (buf) {
        free(buf->data);
        if (buf->filename) free(buf->filename);
        free(buf);
    }
}

static void buffer_grow(Buffer *buf) {
    size_t old_size = buf->size;
    size_t new_size = old_size * 2;
    char *new_data = malloc(new_size);

    size_t pre_gap_len = buf->gap_start;
    size_t post_gap_len = old_size - buf->gap_end;

    memcpy(new_data, buf->data, pre_gap_len);
    memcpy(new_data + new_size - post_gap_len, buf->data + buf->gap_end, post_gap_len);

    free(buf->data);
    buf->data = new_data;
    buf->gap_end = new_size - post_gap_len;
    buf->size = new_size;
}

void buffer_insert(Buffer *buf, const char *s, size_t len) {
    while (buf->gap_end - buf->gap_start < len) {
        buffer_grow(buf);
    }
    memcpy(buf->data + buf->gap_start, s, len);
    buf->gap_start += len;
    buf->modified = 1;
}

static int utf8_char_len(unsigned char c) {
    if ((c & 0x80) == 0) return 1;
    if ((c & 0xE0) == 0xC0) return 2;
    if ((c & 0xF0) == 0xE0) return 3;
    if ((c & 0xF8) == 0xF0) return 4;
    return 1;
}

void buffer_delete(Buffer *buf) {
    if (buf->gap_start > 0) {
        size_t len = 0;
        while (buf->gap_start > 0) {
            buf->gap_start--;
            len++;
            unsigned char c = (unsigned char)buf->data[buf->gap_start];
            if ((c & 0xC0) != 0x80) break; // found start of char
        }
        buf->modified = 1;
    }
}

void buffer_move_cursor_left(Buffer *buf) {
    if (buf->gap_start > 0) {
        do {
            buf->data[--buf->gap_end] = buf->data[--buf->gap_start];
        } while (buf->gap_start > 0 && ((unsigned char)buf->data[buf->gap_start] & 0xC0) == 0x80);
    }
}

void buffer_move_cursor_right(Buffer *buf) {
    if (buf->gap_end < buf->size) {
        unsigned char c = (unsigned char)buf->data[buf->gap_end];
        int len = utf8_char_len(c);
        for (int i = 0; i < len && buf->gap_end < buf->size; i++) {
            buf->data[buf->gap_start++] = buf->data[buf->gap_end++];
        }
    }
}

void buffer_move_to_line_start(Buffer *buf) {
    while (buf->gap_start > 0 && buf->data[buf->gap_start - 1] != '\n') {
        buffer_move_cursor_left(buf);
    }
}

void buffer_move_to_line_end(Buffer *buf) {
    while (buf->gap_end < buf->size && buf->data[buf->gap_end] != '\n') {
        buffer_move_cursor_right(buf);
    }
}

void buffer_move_cursor_up(Buffer *buf) {
    int line, col;
    buffer_get_line_col(buf, &line, &col);
    if (line == 1) {
        buffer_move_to_line_start(buf);
        return;
    }

    buffer_move_to_line_start(buf);
    buffer_move_cursor_left(buf); // Move to previous line end
    buffer_move_to_line_start(buf);
    
    // Move to the same column in the previous line
    for (int i = 1; i < col; i++) {
        if (buf->gap_end < buf->size && buf->data[buf->gap_end] != '\n') {
            buffer_move_cursor_right(buf);
        } else {
            break;
        }
    }
}

void buffer_move_cursor_down(Buffer *buf) {
    int line, col;
    buffer_get_line_col(buf, &line, &col);
    
    buffer_move_to_line_end(buf);
    if (buf->gap_end == buf->size) return; // End of buffer

    buffer_move_cursor_right(buf); // Move to next line start
    
    // Move to the same column in the next line
    for (int i = 1; i < col; i++) {
        if (buf->gap_end < buf->size && buf->data[buf->gap_end] != '\n') {
            buffer_move_cursor_right(buf);
        } else {
            break;
        }
    }
}

void buffer_move_to_line(Buffer *buf, int line_num) {
    if (line_num < 1) line_num = 1;
    
    // Move to start of buffer
    while (buf->gap_start > 0) buffer_move_cursor_left(buf);
    
    int current = 1;
    while (current < line_num && buf->gap_end < buf->size) {
        if (buf->data[buf->gap_end] == '\n') current++;
        buffer_move_cursor_right(buf);
    }
}

void buffer_get_line_col(Buffer *buf, int *line, int *col) {
    *line = 1;
    size_t line_start_idx = 0;
    for (size_t i = 0; i < buf->gap_start; i++) {
        if (buf->data[i] == '\n') {
            (*line)++;
            line_start_idx = i + 1;
        }
    }
    *col = (int)(buf->gap_start - line_start_idx + 1);
}

int buffer_get_total_lines(Buffer *buf) {
    int lines = 1;
    for (size_t i = 0; i < buf->gap_start; i++) {
        if (buf->data[i] == '\n') lines++;
    }
    for (size_t i = buf->gap_end; i < buf->size; i++) {
        if (buf->data[i] == '\n') lines++;
    }
    return lines;
}

size_t buffer_get_cursor_pos(Buffer *buf) {
    return buf->gap_start;
}

static char buffer_get_char_at(Buffer *buf, size_t pos) {
    size_t idx = (pos < buf->gap_start) ? pos : pos + (buf->gap_end - buf->gap_start);
    return buf->data[idx];
}

size_t buffer_find(Buffer *buf, const char *query, size_t start_pos) {
    if (!query || query[0] == '\0') return (size_t)-1;
    size_t qlen = strlen(query);
    size_t total_len = buf->size - (buf->gap_end - buf->gap_start);
    
    if (total_len < qlen) return (size_t)-1;

    for (size_t i = start_pos; i <= total_len - qlen; i++) {
        int match = 1;
        for (size_t j = 0; j < qlen; j++) {
            if (buffer_get_char_at(buf, i + j) != query[j]) {
                match = 0;
                break;
            }
        }
        if (match) return i;
    }
    return (size_t)-1;
}

void buffer_get_selection_range(Buffer *buf, size_t *start, size_t *end) {
    size_t cursor = buffer_get_cursor_pos(buf);
    if (buf->selection_start < cursor) {
        *start = buf->selection_start;
        *end = cursor;
    } else {
        *start = cursor;
        *end = buf->selection_start;
    }
}

char* buffer_get_text_range(Buffer *buf, size_t start, size_t end) {
    if (start >= end) return NULL;
    size_t len = end - start;
    char *res = malloc(len + 1);
    
    size_t copied = 0;
    for (size_t i = start; i < end; i++) {
        size_t idx = (i < buf->gap_start) ? i : i + (buf->gap_end - buf->gap_start);
        res[copied++] = buf->data[idx];
    }
    res[copied] = '\0';
    return res;
}

void buffer_delete_range(Buffer *buf, size_t start, size_t end) {
    if (start >= end) return;
    // Move gap to end of range
    while (buffer_get_cursor_pos(buf) < end) buffer_move_cursor_right(buf);
    // Delete until start
    while (buffer_get_cursor_pos(buf) > start) buffer_delete(buf);
}

BufferManager* buffer_manager_create() {
    BufferManager *bm = malloc(sizeof(BufferManager));
    bm->buffers = NULL;
    bm->count = 0;
    bm->current = 0;
    return bm;
}

void buffer_manager_destroy(BufferManager *bm) {
    if (bm) {
        for (size_t i = 0; i < bm->count; i++) {
            buffer_destroy(bm->buffers[i]);
        }
        free(bm->buffers);
        free(bm);
    }
}

void buffer_manager_add(BufferManager *bm, Buffer *buf) {
    bm->buffers = realloc(bm->buffers, sizeof(Buffer*) * (bm->count + 1));
    bm->buffers[bm->count++] = buf;
    bm->current = bm->count - 1;
}

void buffer_manager_next(BufferManager *bm) {
    if (bm->count > 0) {
        bm->current = (bm->current + 1) % bm->count;
    }
}

void buffer_manager_prev(BufferManager *bm) {
    if (bm->count > 0) {
        bm->current = (bm->current + bm->count - 1) % bm->count;
    }
}

void buffer_manager_close_current(BufferManager *bm) {
    if (bm->count == 0) return;
    buffer_destroy(bm->buffers[bm->current]);
    for (size_t i = bm->current; i < bm->count - 1; i++) {
        bm->buffers[i] = bm->buffers[i+1];
    }
    bm->count--;
    if (bm->count > 0) {
        if (bm->current >= bm->count) bm->current = bm->count - 1;
    } else {
        buffer_manager_add(bm, buffer_create(NULL));
    }
}

Buffer* buffer_manager_current(BufferManager *bm) {
    if (bm->count == 0) return NULL;
    return bm->buffers[bm->current];
}
