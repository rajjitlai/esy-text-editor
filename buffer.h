#ifndef BUFFER_H
#define BUFFER_H

#include <stddef.h>

typedef struct {
    char *data;
    size_t size;
    size_t gap_start;
    size_t gap_end;
    char *filename;
    int modified;
    size_t selection_start;
    int selecting;
} Buffer;

typedef struct {
    Buffer **buffers;
    size_t count;
    size_t current;
} BufferManager;

Buffer* buffer_create(const char *filename);
void buffer_destroy(Buffer *buf);
void buffer_insert(Buffer *buf, const char *s, size_t len);
void buffer_delete(Buffer *buf);
void buffer_move_cursor_left(Buffer *buf);
void buffer_move_cursor_right(Buffer *buf);
void buffer_move_cursor_up(Buffer *buf);
void buffer_move_cursor_down(Buffer *buf);
void buffer_move_to_line(Buffer *buf, int line_num);
void buffer_move_to_line_start(Buffer *buf);
void buffer_move_to_line_end(Buffer *buf);
void buffer_get_line_col(Buffer *buf, int *line, int *col);
int buffer_get_total_lines(Buffer *buf);
size_t buffer_get_cursor_pos(Buffer *buf);
size_t buffer_find(Buffer *buf, const char *query, size_t start_pos);
void buffer_get_selection_range(Buffer *buf, size_t *start, size_t *end);
char* buffer_get_text_range(Buffer *buf, size_t start, size_t end);
void buffer_delete_range(Buffer *buf, size_t start, size_t end);

BufferManager* buffer_manager_create();
void buffer_manager_destroy(BufferManager *bm);
void buffer_manager_add(BufferManager *bm, Buffer *buf);
void buffer_manager_next(BufferManager *bm);
void buffer_manager_prev(BufferManager *bm);
void buffer_manager_close_current(BufferManager *bm);
Buffer* buffer_manager_current(BufferManager *bm);

#endif
