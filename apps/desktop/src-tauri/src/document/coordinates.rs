use crate::domain::error::AppError;
use unicode_segmentation::UnicodeSegmentation;

pub fn utf16_to_byte(text: &str, position: u32) -> Result<usize, AppError> {
    let mut offset = 0;
    for (byte, character) in text.char_indices() {
        if offset == position as usize {
            return Ok(byte);
        }
        offset += character.len_utf16();
        if offset > position as usize {
            return Err(AppError::invalid("선택 범위가 문자 중간에 있습니다."));
        }
    }
    if offset == position as usize {
        return Ok(text.len());
    }
    Err(AppError::invalid("선택 범위가 문서를 벗어났습니다."))
}

pub fn grapheme_boundary(text: &str, byte: usize) -> Result<(), AppError> {
    if byte == text.len() || text.grapheme_indices(true).any(|(at, _)| at == byte) {
        return Ok(());
    }
    Err(AppError::invalid(
        "완성된 글자 경계로 범위를 선택해 주세요.",
    ))
}

pub fn byte_to_utf16(text: &str, byte: usize) -> u32 {
    text[..byte].encode_utf16().count() as u32
}
