(() => {
  const LOGO_SRC = '/logo%20home.png';
  const MOBILE_QUERY = window.matchMedia('(max-width: 768px)');

  class HomeBranding {
    constructor() {
      this.root = null;
      this.boundRender = this.render.bind(this);
    }

    init() {
      this.root = document.getElementById('homeBrandingMount');
      if (!this.root) return;

      this.render();

      if (typeof MOBILE_QUERY.addEventListener === 'function') {
        MOBILE_QUERY.addEventListener('change', this.boundRender);
      } else if (typeof MOBILE_QUERY.addListener === 'function') {
        MOBILE_QUERY.addListener(this.boundRender);
      }
    }

    getHighlights() {
      return MOBILE_QUERY.matches
        ? [
            { icon: 'fa-solid fa-mobile-screen-button', label: 'Mobile enxuto' },
            { icon: 'fa-solid fa-icons', label: 'Acesso rapido' },
          ]
        : [
            { icon: 'fa-solid fa-display', label: 'Desktop imersivo' },
            { icon: 'fa-solid fa-mobile-screen-button', label: 'Mobile otimizado' },
            { icon: 'fa-solid fa-sparkles', label: 'Home sempre limpa' },
          ];
    }

    render() {
      if (!this.root) return;

      const highlights = this.getHighlights()
        .map(
          (item) => `
            <span class="home-hero-point">
              <i class="${item.icon}" aria-hidden="true"></i>
              <span>${item.label}</span>
            </span>
          `
        )
        .join('');

      this.root.innerHTML = `
        <div class="home-hero" data-home-branding>
          <div class="home-hero-copy">
            <span class="home-hero-eyebrow">
              <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
              <span>SuperApp Home</span>
            </span>
            <h2>Uma base unica para acessar tudo.</h2>
            <p>
              Organize seus modulos, entre em cada aplicacao com rapidez e volte para a tela inicial sempre que sair da experiencia.
            </p>
            <div class="home-hero-points" aria-label="Recursos destacados">
              ${highlights}
            </div>
          </div>

          <div class="home-hero-art" aria-hidden="true">
            <img src="${LOGO_SRC}" alt="" loading="eager" />
          </div>
        </div>
      `;
    }
  }

  window.SuperAppHomeBranding = new HomeBranding();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.SuperAppHomeBranding.init(), { once: true });
  } else {
    window.SuperAppHomeBranding.init();
  }
})();
