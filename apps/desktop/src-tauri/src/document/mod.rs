//! Markdown parsing, source coordinates and document transformations.
pub mod annotations;
pub mod coordinates;
pub mod diff;
pub mod links;
pub mod parse;
pub mod patch;
mod patch_fences;
pub mod patch_groups;
mod patch_moves;
mod patch_structure;
pub mod review;
pub mod revisions;
mod rewrite_blocks;
mod rewrite_groups;
pub mod rewrite_plan;
pub(crate) mod rewrite_references;
pub mod scope;
pub mod selection;
