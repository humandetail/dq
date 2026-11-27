const paths = {
    pause: 'M9 5v14M15 5v14',
    play: 'M8 5v14l11-7z',
    oblique: 'M12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
    overhead: 'M4 4h16v16H4zM4 12h16M12 4v16',
    'rotate-left': 'M4 10a8 8 0 1 1 3 8M4 4v6h6',
    'rotate-right': 'M20 10a8 8 0 1 0-3 8M20 4v6h-6',
    'zoom-in': 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM14.5 14.5 20 20M7 10h6m-3-3v6',
    'zoom-out': 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM14.5 14.5 20 20M7 10h6',
    recenter: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6M12 9v6m-3-3h6',
    shop: 'M3 4h2l3 11h10l3-7H6M9 20h.01m8 0h.01',
    codex: 'M12 6v14M12 6C9 4 6 4 3 5v13c3-1 6-1 9 2 3-3 6-3 9-2V5c-3-1-6-1-9 1z',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v5m0-8h.01',
    more: 'M6 12h.8m5.6 0h.8m5.6 0h.8',
    close: 'm6 6 12 12M6 18 18 6',
    back: 'M20 12H4m7-7-7 7 7 7',
    move: 'M19 10c0 4-7 10-7 10S5 14 5 10a7 7 0 1 1 14 0zM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    attack: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM12 2v6m0 8v6M2 12h6m8 0h6',
    stop: 'M6 6h12v12H6z',
    retry: 'M20 10a8 8 0 1 0-2 8m2-14v6h-6',
    build: 'm3 5 2-2 7 7-2 2zM12 8l4-4 4 4-4 4m-6-2 8 8-2 2-8-8',
    combine: 'M4 5h3l5 7h8M4 19h3l5-7m5-3 3 3-3 3',
    order: 'M6 21V4m0 1c4-3 8 3 13 0v10c-5 3-9-3-13 0',
    inventory: 'M6 8h12a2 2 0 0 1 2 2v10H4V10a2 2 0 0 1 2-2zM9 8V6a3 3 0 0 1 6 0v2m-7 5h8m-8 3h8',
    commands: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z',
} as const;

type CommandIcon = keyof typeof paths;

export function setCommandIcon(button: HTMLElement, icon: CommandIcon, label?: string) {
    if (button.dataset.commandIcon !== icon) {
        const fill = icon === 'stop' ? 'currentColor' : 'none';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[icon]}"/></svg>`;
        button.style.setProperty('--command-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
        button.dataset.commandIcon = icon;
    }
    button.classList.toggle('command-icon-only', label !== undefined);
    button.classList.toggle('command-icon-label', label === undefined);
    if (label !== undefined && button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.title = label;
    }
}
