use crate::a2ui::schema::A2UIGraph;
use regex::Regex;
use serde_json;
use std::collections::HashSet;

#[derive(Debug, PartialEq)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

pub fn parse_a2ui_block(text: &str) -> Result<A2UIGraph, ParseError> {
    let re = Regex::new(r"(?s)```a2ui\s*\n(.*?)\n```")
        .map_err(|e| ParseError(format!("regex compile: {e}")))?;

    let captures: Vec<_> = re.captures_iter(text).collect();
    let last = captures
        .last()
        .ok_or_else(|| ParseError("no a2ui block found in agent output".into()))?;
    let body = last
        .get(1)
        .map(|m| m.as_str())
        .ok_or_else(|| ParseError("no a2ui block content".into()))?;

    let graph: A2UIGraph = serde_json::from_str(body)
        .map_err(|e| ParseError(format!("invalid json in a2ui block: {e}")))?;

    validate(&graph)?;
    Ok(graph)
}

fn validate(g: &A2UIGraph) -> Result<(), ParseError> {
    if g.meta.version != "0.1" {
        return Err(ParseError(format!(
            "unsupported version {} (expected 0.1)",
            g.meta.version
        )));
    }
    if g.meta.layout_mode != "flow" {
        return Err(ParseError(format!(
            "unsupported layoutMode {} (expected flow)",
            g.meta.layout_mode
        )));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    for n in &g.nodes {
        if n.node_type != "step" {
            return Err(ParseError(format!(
                "unknown node type '{}' on node {}",
                n.node_type, n.id
            )));
        }
        if !ids.insert(&n.id) {
            return Err(ParseError(format!("duplicate node id '{}'", n.id)));
        }
    }

    for n in &g.nodes {
        if let Some(hint) = &n.position_hint {
            if let Some(after) = &hint.after {
                if !ids.contains(after.as_str()) {
                    return Err(ParseError(format!(
                        "node '{}' positionHint.after references missing node '{}'",
                        n.id, after
                    )));
                }
            }
        }
    }

    for e in &g.edges {
        if !ids.contains(e.from.as_str()) {
            return Err(ParseError(format!(
                "edge '{}' references missing node '{}' as from",
                e.id, e.from
            )));
        }
        if !ids.contains(e.to.as_str()) {
            return Err(ParseError(format!(
                "edge '{}' references missing node '{}' as to",
                e.id, e.to
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"
analysis text...

```a2ui
{
  "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [
    { "id": "a", "type": "step", "label": "Step A" },
    { "id": "b", "type": "step", "label": "Step B" }
  ],
  "edges": [
    { "id": "e1", "from": "a", "to": "b" }
  ]
}
```
"#;

    #[test]
    fn parses_valid_block() {
        let g = parse_a2ui_block(VALID).expect("should parse");
        assert_eq!(g.nodes.len(), 2);
        assert_eq!(g.edges.len(), 1);
        assert_eq!(g.meta.version, "0.1");
        assert_eq!(g.meta.layout_mode, "flow");
    }

    #[test]
    fn picks_last_a2ui_block_when_multiple() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" }, "nodes": [], "edges": [] }
```
some prose
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [{ "id": "x", "type": "step", "label": "X" }],
  "edges": [] }
```
"#;
        let g = parse_a2ui_block(text).expect("should parse");
        assert_eq!(g.nodes.len(), 1);
        assert_eq!(g.nodes[0].id, "x");
    }

    #[test]
    fn errors_when_no_block() {
        let err = parse_a2ui_block("just prose, no graph").unwrap_err();
        assert!(err.0.to_lowercase().contains("no a2ui block"));
    }

    #[test]
    fn errors_on_bad_json() {
        let text = "```a2ui\n{ not json }\n```";
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("json"));
    }

    #[test]
    fn errors_on_wrong_version() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.2", "layoutMode": "flow" }, "nodes": [], "edges": [] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("version"));
    }

    #[test]
    fn errors_on_duplicate_node_id() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [
    { "id": "a", "type": "step", "label": "A" },
    { "id": "a", "type": "step", "label": "A2" }
  ], "edges": [] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("duplicate"));
    }

    #[test]
    fn errors_on_dangling_edge() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [{ "id": "a", "type": "step", "label": "A" }],
  "edges": [{ "id": "e", "from": "a", "to": "missing" }] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("missing") || err.0.to_lowercase().contains("unknown"));
    }

    #[test]
    fn errors_on_dangling_position_hint_after() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [
    { "id": "a", "type": "step", "label": "A",
      "positionHint": { "after": "ghost" } }
  ],
  "edges": [] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        let msg = err.0.to_lowercase();
        assert!(
            msg.contains("missing") || msg.contains("unknown"),
            "expected missing/unknown in error, got: {}",
            err.0
        );
        assert!(msg.contains("after"), "expected 'after' in error, got: {}", err.0);
    }
}
