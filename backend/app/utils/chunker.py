from typing import List

def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[str]:
    """Split a string into chunks of standard character length, preserving sentence structure.
    
    Args:
        text: The source document text.
        chunk_size: Maximum characters per chunk.
        chunk_overlap: Overlapping characters between consecutive chunks.
        
    Returns:
        A list of string chunks.
    """
    if not text:
        return []
        
    # Safeguards
    if chunk_size <= 0:
        chunk_size = 500
    if chunk_overlap < 0:
        chunk_overlap = 0
    if chunk_overlap >= chunk_size:
        chunk_overlap = chunk_size // 2
        
    chunks = []
    text_len = len(text)
    start = 0
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        
        # If we aren't at the end of the text, try to find a natural boundary to split on
        if end < text_len:
            # Lookback up to 20% of chunk_size to find a paragraph, sentence, or word boundary
            lookback_limit = max(start, end - int(chunk_size * 0.2))
            boundary_idx = -1
            
            # 1. Try to find a paragraph break
            for i in range(end, lookback_limit, -1):
                if text[i-2:i] == "\n\n":
                    boundary_idx = i
                    break
            
            # 2. Try to find a line break
            if boundary_idx == -1:
                for i in range(end, lookback_limit, -1):
                    if text[i-1] == "\n":
                        boundary_idx = i
                        break
                        
            # 3. Try to find a sentence terminator (. ! ?) followed by a space
            if boundary_idx == -1:
                for i in range(end, lookback_limit, -1):
                    if text[i-1] in [".", "!", "?"] and (i < text_len and text[i] == " "):
                        boundary_idx = i
                        break
            
            # 4. Try to find a word boundary (space, comma, semicolon)
            if boundary_idx == -1:
                for i in range(end, lookback_limit, -1):
                    if text[i-1] in [" ", ",", ";"]:
                        boundary_idx = i
                        break
                        
            # If a boundary was found, align the end of our chunk to it
            if boundary_idx != -1:
                end = boundary_idx
                
        chunk = text[start:end].strip()
        # Only skip genuinely empty strings; keep all non-empty chunks regardless
        # of length.  The old 100-char floor silently discarded small documents
        # (e.g. short TXT files) and left them with zero chunks.
        if chunk:
            chunks.append(chunk)
            
        # Advance start, ensuring progress. If remaining text is shorter than overlap,
        # jump all the way to end to avoid generating micro-fragment chunks.
        actual_step = end - start
        advance = max(1, actual_step - chunk_overlap)
        start += advance
        
    return chunks
