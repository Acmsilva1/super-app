import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

describe('splash screen de abertura', () => {
    it('usa a arte principal ao fundo e exibe progresso', () => {
        expect(html).toContain('id="appLaunchSplash"');
        expect(html).toContain("url('/logo%20home.png') center / cover no-repeat");
        expect(html).toContain('<link rel="preload" as="image" href="/logo%20home.png" fetchpriority="high">');
        expect(html).toContain('app-launch-splash__progress-bar');
        expect(html).toContain('Preparando seu espaço...');
    });

    it('aguarda a carga inicial e sempre libera a interface', () => {
        expect(html).toMatch(/async loadData\(\)\s*\{\s*await Promise\.all\(\[/);
        expect(html).toMatch(/finally\s*\{\s*this\.dismissLaunchSplash\(\);\s*\}/);
        expect(html).toContain('const minimumVisibleMs = 900;');
    });

    it('nao bloqueia a abertura esperando bibliotecas de graficos', () => {
        const initStart = html.indexOf('async init() {', html.indexOf('const SuperApp ='));
        const initEnd = html.indexOf('dismissLaunchSplash()', initStart);
        const initBody = html.slice(initStart, initEnd);
        expect(initBody).not.toContain('await this.ensureVisualizationLibraries()');
    });
});
