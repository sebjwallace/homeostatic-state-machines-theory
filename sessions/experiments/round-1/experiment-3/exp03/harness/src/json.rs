//! A minimal JSON value and writer (std only).

use std::fmt::Write;

#[derive(Clone, Debug)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn obj() -> Self {
        Json::Obj(Vec::new())
    }
    pub fn set(&mut self, k: &str, v: impl Into<Json>) -> &mut Self {
        if let Json::Obj(ref mut kv) = self {
            kv.push((k.to_string(), v.into()));
        }
        self
    }
    pub fn to_string_pretty(&self) -> String {
        let mut s = String::new();
        self.write(&mut s, 0);
        s.push('\n');
        s
    }
    fn write(&self, out: &mut String, ind: usize) {
        match self {
            Json::Null => out.push_str("null"),
            Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Json::Num(x) => {
                if x.is_finite() {
                    if x.fract() == 0.0 && x.abs() < 1e15 {
                        let _ = write!(out, "{}", *x as i64);
                    } else {
                        let _ = write!(out, "{}", x);
                    }
                } else {
                    out.push_str("null");
                }
            }
            Json::Str(s) => esc(out, s),
            Json::Arr(xs) => {
                let simple = xs.iter().all(|x| matches!(x, Json::Num(_) | Json::Str(_) | Json::Bool(_) | Json::Null));
                if simple {
                    out.push('[');
                    for (i, x) in xs.iter().enumerate() {
                        if i > 0 {
                            out.push_str(", ");
                        }
                        x.write(out, ind);
                    }
                    out.push(']');
                } else {
                    out.push_str("[\n");
                    for (i, x) in xs.iter().enumerate() {
                        pad(out, ind + 1);
                        x.write(out, ind + 1);
                        if i + 1 < xs.len() {
                            out.push(',');
                        }
                        out.push('\n');
                    }
                    pad(out, ind);
                    out.push(']');
                }
            }
            Json::Obj(kv) => {
                if kv.is_empty() {
                    out.push_str("{}");
                    return;
                }
                out.push_str("{\n");
                for (i, (k, v)) in kv.iter().enumerate() {
                    pad(out, ind + 1);
                    esc(out, k);
                    out.push_str(": ");
                    v.write(out, ind + 1);
                    if i + 1 < kv.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                pad(out, ind);
                out.push('}');
            }
        }
    }
}

fn pad(out: &mut String, ind: usize) {
    for _ in 0..ind {
        out.push_str("  ");
    }
}

fn esc(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

impl From<f64> for Json {
    fn from(x: f64) -> Self {
        Json::Num(x)
    }
}
impl From<usize> for Json {
    fn from(x: usize) -> Self {
        Json::Num(x as f64)
    }
}
impl From<u64> for Json {
    fn from(x: u64) -> Self {
        Json::Num(x as f64)
    }
}
impl From<bool> for Json {
    fn from(x: bool) -> Self {
        Json::Bool(x)
    }
}
impl From<&str> for Json {
    fn from(x: &str) -> Self {
        Json::Str(x.to_string())
    }
}
impl From<String> for Json {
    fn from(x: String) -> Self {
        Json::Str(x)
    }
}
impl<T: Into<Json>> From<Vec<T>> for Json {
    fn from(x: Vec<T>) -> Self {
        Json::Arr(x.into_iter().map(Into::into).collect())
    }
}
impl<T: Into<Json>> From<Option<T>> for Json {
    fn from(x: Option<T>) -> Self {
        match x {
            Some(v) => v.into(),
            None => Json::Null,
        }
    }
}
