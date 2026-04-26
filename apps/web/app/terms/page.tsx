export default function TermsPage() {
  return (
    <main className="legalPage">
      <a className="legalBack" href="/">Obscribe</a>
      <section className="legalShell">
        <p className="kicker">Terms</p>
        <h1>Terms of Service</h1>
        <p>
          These terms are a launch-ready baseline for Obscribe. They should be reviewed by counsel before broad paid access.
        </p>
        <h2>Use of the Service</h2>
        <p>
          You are responsible for the notes, files, and account activity in your workspace. Do not use Obscribe for unlawful
          content, abusive activity, or attempts to disrupt the service.
        </p>
        <h2>Self-Hosted Installs</h2>
        <p>
          Self-hosted operators are responsible for their server, DNS, SSL, email delivery, backups, updates, and user access.
        </p>
        <h2>Hosted Plans</h2>
        <p>
          Hosted plan details can change while the product is in early access. Paid plan terms should be finalized before
          general availability.
        </p>
        <h2>Availability</h2>
        <p>
          Obscribe is provided as an evolving notes workspace. Keep backups for any content you cannot afford to lose.
        </p>
      </section>
    </main>
  );
}
