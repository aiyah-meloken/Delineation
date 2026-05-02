// stub — populated in Task 6
#[derive(Debug)]
pub struct ParseError(pub String);

pub fn parse_a2ui_block(_text: &str) -> Result<crate::a2ui::A2UIGraph, ParseError> {
    Err(ParseError("not implemented".into()))
}
