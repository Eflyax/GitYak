// git's global options — the ones that can redirect git at another repository, run a
// different binary, or execute arbitrary shell through configuration. A global option may
// appear only BEFORE the subcommand, so this list is checked only in the leading run of
// option-looking tokens. `git rev-parse --git-dir` is legitimate: there `--git-dir` belongs
// to rev-parse, not to git.
const FORBIDDEN_GLOBAL: [&str; 6] = ["-c", "-C", "--exec-path", "--git-dir", "--work-tree", "--namespace"];

// Options that make git execute a command of the caller's choosing (a hook, a remote
// helper, an arbitrary shell command) regardless of which subcommand they're attached to —
// `fetch --upload-pack=...`, `push --receive-pack=...`, `rebase --exec=...` / `-x`. These
// have no legitimate use through this generic route, so they are refused ANYWHERE in the
// argument vector, not just in the leading run.
const FORBIDDEN_ANYWHERE: [&str; 4] = ["--upload-pack", "--receive-pack", "--exec", "-x"];

/// Returns the first forbidden git option, if any. `FORBIDDEN_GLOBAL` is checked only before
/// the subcommand (global options may appear only there — `git rev-parse --git-dir` is
/// legitimate because `--git-dir` there belongs to rev-parse). `FORBIDDEN_ANYWHERE` is checked
/// regardless of position, because those options let git execute a command of the caller's
/// choosing no matter which subcommand they're attached to.
pub fn find_forbidden_git_option(args: &[String]) -> Option<&str> {
	let mut saw_subcommand = false;

	for arg in args {
		if !arg.starts_with('-') {
			saw_subcommand = true;
			continue;
		}

		let name = arg.split('=').next().unwrap_or(arg);

		if !saw_subcommand && FORBIDDEN_GLOBAL.contains(&name) {
			return Some(arg);
		}

		if FORBIDDEN_ANYWHERE.contains(&name) {
			return Some(arg);
		}
	}

	None
}

/// The two lists are refused for different reasons, so the refusal must say which applied:
/// reporting `--exec` as "a git global option" is simply false — it is a subcommand option.
/// The lists do not overlap, so the option name alone determines the reason.
pub fn describe_forbidden_git_option(option: &str) -> String {
	let name = option.split('=').next().unwrap_or(option);

	if FORBIDDEN_ANYWHERE.contains(&name) {
		return format!("Refused: \"{option}\" makes git run a command of the caller's choosing and is not allowed here");
	}

	format!("Refused: \"{option}\" is a git global option and is not allowed here")
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

	#[test]
	fn rejects_executing_options_after_subcommand() {
		assert_eq!(
			find_forbidden_git_option(&v(&["fetch", "--upload-pack=touch /tmp/x", "origin"])),
			Some("--upload-pack=touch /tmp/x")
		);
		assert_eq!(
			find_forbidden_git_option(&v(&["push", "--receive-pack=touch /tmp/x", "origin"])),
			Some("--receive-pack=touch /tmp/x")
		);
		assert_eq!(
			find_forbidden_git_option(&v(&["rebase", "--exec=touch /tmp/x", "HEAD~1"])),
			Some("--exec=touch /tmp/x")
		);
		assert_eq!(find_forbidden_git_option(&v(&["rebase", "-x", "touch /tmp/x"])), Some("-x"));
	}

	#[test]
	fn describes_a_global_option_as_a_global_option() {
		assert_eq!(
			describe_forbidden_git_option("-c"),
			"Refused: \"-c\" is a git global option and is not allowed here"
		);
	}

	#[test]
	fn describes_an_executing_option_by_what_it_does() {
		assert_eq!(
			describe_forbidden_git_option("--exec=touch /tmp/x"),
			"Refused: \"--exec=touch /tmp/x\" makes git run a command of the caller's choosing and is not allowed here"
		);
		assert_eq!(
			describe_forbidden_git_option("-x"),
			"Refused: \"-x\" makes git run a command of the caller's choosing and is not allowed here"
		);
	}

	#[test]
	fn allows_ordinary_fetch_and_push() {
		assert_eq!(find_forbidden_git_option(&v(&["fetch", "--prune", "--all"])), None);
		assert_eq!(
			find_forbidden_git_option(&v(&["push", "--set-upstream", "origin", "main"])),
			None
		);
		assert_eq!(
			find_forbidden_git_option(&v(&["push", "origin", "--delete", "branch"])),
			None
		);
	}
}
