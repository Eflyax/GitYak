const FORBIDDEN: [&str; 8] = [
	"-c",
	"-C",
	"--exec-path",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--upload-pack",
	"--receive-pack",
];

/// Returns the first forbidden git *global* option, if any. Global options may appear only
/// before the subcommand, so scanning stops at the first non-option token — `git rev-parse
/// --git-dir` is legitimate, because there `--git-dir` belongs to rev-parse.
pub fn find_forbidden_git_option(args: &[String]) -> Option<&str> {
	for arg in args {
		if !arg.starts_with('-') {
			return None;
		}

		let name = arg.split('=').next().unwrap_or(arg);

		if FORBIDDEN.contains(&name) {
			return Some(arg);
		}
	}

	None
}

#[cfg(test)]
mod tests {
	use super::*;

	fn v(items: &[&str]) -> Vec<String> {
		items.iter().map(|s| s.to_string()).collect()
	}

	#[test]
	fn rejects_dash_c() {
		assert_eq!(find_forbidden_git_option(&v(&["-c", "alias.x=!sh", "x"])), Some("-c"));
	}

	#[test]
	fn rejects_equals_form() {
		assert_eq!(
			find_forbidden_git_option(&v(&["--git-dir=/tmp", "status"])),
			Some("--git-dir=/tmp")
		);
	}

	#[test]
	fn allows_git_dir_after_subcommand() {
		assert_eq!(find_forbidden_git_option(&v(&["rev-parse", "--git-dir"])), None);
	}

	#[test]
	fn allows_ordinary_commands() {
		assert_eq!(find_forbidden_git_option(&v(&["status", "--porcelain"])), None);
	}
}
