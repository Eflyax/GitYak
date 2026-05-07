export const TOKEN_TO_CSS_VAR: Record<string, string> = {
    // ── Backgrounds ──────────────────────────────────────────────────────────────
    'app__bg0':          '--bg-app',
    'panel__bg0':        '--bg-panel',
    'panel__bg2':        '--bg-section',
    'toolbar__bg0':      '--bg-toolbar',
    'toolbar__bg1':      '--bg-toolbar-alt',
    'toolbar__bg2':      '--bg-toolbar-strong',
    'panel__bg1':        '--bg-button',
    'input__bg':         '--bg-input',
    'card__bg':          '--bg-card',

    // ── Borders ───────────────────────────────────────────────────────────────────
    'panel-border':      '--border',
    'section-border':    '--border-strong',
    'subtle-border':     '--border-subtle',

    // ── Text ──────────────────────────────────────────────────────────────────────
    'text-selected':     '--text-primary',
    'text-normal':       '--text-default',
    'text-secondary':    '--text-secondary',
    'text-disabled':     '--text-muted',
    'text-accent':       '--color-accent',

    // ── Base colors (semantic names) ───────────────────────────────────────────────
    'white':             '--color-white',
    'blue':              '--color-blue',
    'ltblue':            '--color-cyan',
    'teal':              '--color-teal',
    'green':             '--color-success',
    'red':               '--color-danger',
    'yellow':            '--color-warning',
    'orange':            '--color-orange',
    'purple':            '--color-purple',

    // ── Interactive states ─────────────────────────────────────────────────────────
    'hover-row':         '--bg-hover',
    'selected-row':      '--bg-selected',
    'danger-row':        '--bg-danger-row',
    'warning-row':       '--bg-warning-row',

    // ── Buttons ───────────────────────────────────────────────────────────────────
    'btn-text':          '--btn-text',
    'btn-text-hover':    '--btn-text-hover',
    'default-border':    '--btn-default-border',
    'default-bg':        '--btn-default-bg',
    'default-hover':     '--btn-default-hover',
    'default-border-hover': '--btn-default-border-hover',
    'primary-border':    '--btn-primary-border',
    'primary-bg':        '--btn-primary-bg',
    'primary-hover':     '--btn-primary-hover',
    'success-border':    '--btn-success-border',
    'success-bg':        '--btn-success-bg',
    'success-hover':     '--btn-success-hover',
    'warning-border':    '--btn-warning-border',
    'warning-bg':        '--btn-warning-bg',
    'warning-hover':     '--btn-warning-hover',
    'danger-border':     '--btn-danger-border',
    'danger-bg':         '--btn-danger-bg',
    'danger-hover':      '--btn-danger-hover',

    // ── Component states ──────────────────────────────────────────────────────────
    'filtering':         '--state-filtering',
    'soloing':           '--state-soloing',
    'checked-out':       '--state-checked-out',
    'verified':          '--state-verified',
    'link-color':        '--color-link',

    // ── Code diff ─────────────────────────────────────────────────────────────────
    'added-line':        '--diff-added',
    'deleted-line':      '--diff-deleted',
    'modified-line':     '--diff-modified',
    'code-bg':           '--code-bg',
    'code-foreground':   '--code-fg',

    // ── Conflict editor ────────────────────────────────────────────────────────────
    'conflict-left-border-color':   '--conflict-left-border',
    'conflict-left-color':          '--conflict-left-bg',
    'conflict-right-border-color':  '--conflict-right-border',
    'conflict-right-color':         '--conflict-right-bg',
    'conflict-output-border-color': '--conflict-output-border',
    'conflict-output-color':        '--conflict-output-bg',
    'conflict-info-color':          '--conflict-info',

    // ── Graph colors ──────────────────────────────────────────────────────────────
    'graph-color-0':     '--graph-0',
    'graph-color-1':     '--graph-1',
    'graph-color-2':     '--graph-2',
    'graph-color-3':     '--graph-3',
    'graph-color-4':     '--graph-4',
    'graph-color-5':     '--graph-5',
    'graph-color-6':     '--graph-6',
    'graph-color-7':     '--graph-7',
    'graph-color-8':     '--graph-8',
    'graph-color-9':     '--graph-9',

    // ── Terminal ──────────────────────────────────────────────────────────────────
    'terminal__background':   '--terminal-bg',
    'terminal__foreground':   '--terminal-fg',
    'terminal__cursor':       '--terminal-cursor',
    'terminal__cursorAccent': '--terminal-cursor-accent',
    'terminal__selection':    '--terminal-selection',
    'terminal__black':        '--terminal-black',
    'terminal__red':          '--terminal-red',
    'terminal__green':        '--terminal-green',
    'terminal__yellow':       '--terminal-yellow',
    'terminal__blue':         '--terminal-blue',
    'terminal__magenta':      '--terminal-magenta',
    'terminal__cyan':         '--terminal-cyan',
    'terminal__white':        '--terminal-white',
    'terminal__brightBlack':  '--terminal-bright-black',
    'terminal__brightRed':    '--terminal-bright-red',
    'terminal__brightGreen':  '--terminal-bright-green',
    'terminal__brightYellow': '--terminal-bright-yellow',
    'terminal__brightBlue':   '--terminal-bright-blue',
    'terminal__brightMagenta':'--terminal-bright-magenta',
    'terminal__brightCyan':   '--terminal-bright-cyan',
    'terminal__brightWhite':  '--terminal-bright-white',
    'terminal__repo-name-color':     '--terminal-repo-name',
    'terminal__repo-branch-color':   '--terminal-repo-branch',
    'terminal__repo-tag-color':      '--terminal-repo-tag',
    'terminal__repo-upstream-color': '--terminal-repo-upstream',

    // ── Scroll ────────────────────────────────────────────────────────────────────
    'scroll-thumb-bg':        '--scroll-thumb',
    'scroll-thumb-bg-light':  '--scroll-thumb-hover',
    'scroll-thumb-border':    '--scroll-thumb-border',

    // ── Misc ──────────────────────────────────────────────────────────────────────
    'modal-overlay-color':  '--modal-overlay',
    'input-bg-warn-color':  '--input-bg-warn',
    'form-control-focus':   '--input-focus',
};

export function tokenToCssVar(token: string): string {
    return TOKEN_TO_CSS_VAR[token] ?? `--theme-${token.replace(/[_.]/g, '-').replace(/-+/g, '-')}`;
}
