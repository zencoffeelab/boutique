export function ComingSoonPage({ title, message }: { title: string; message: string }) {
  return <main id="main-content" className="coming-soon-page">
    <div className="coming-soon-page__content">
      <img className="coming-soon-page__logo" src="/media/logo-black.svg" alt="Zen Coffee Lab" width="208" height="112" />
      <p className="eyebrow">Micro-roastery · Tours</p>
      <h1>{title}</h1>
      <p className="coming-soon-page__message">{message}</p>
      <a href="mailto:contact@zencoffeelab.com">contact@zencoffeelab.com</a>
    </div>
  </main>;
}
