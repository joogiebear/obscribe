export default function ContactPage() {
  return (
    <main className="legalPage">
      <a className="legalBack" href="/">Obscribe</a>
      <section className="legalShell">
        <p className="kicker">Contact</p>
        <h1>Contact</h1>
        <p>
          For now, contact is handled by the workspace operator. Hosted Obscribe support should route to the public support
          inbox once plans move out of early access.
        </p>
        <h2>Recommended Hosted Inbox</h2>
        <p>Use a monitored address such as support@obscribe.com for user support and billing questions.</p>
        <h2>Operator Notes</h2>
        <p>
          Self-hosted operators should publish their own contact email if they invite other people into their workspace.
        </p>
      </section>
    </main>
  );
}
