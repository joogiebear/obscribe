export default function SupportPage() {
  return (
    <main className="legalPage">
      <a className="legalBack" href="/">Obscribe</a>
      <section className="legalShell">
        <p className="kicker">Support</p>
        <h1>Support</h1>
        <p>
          For hosted users, support starts with account access, email delivery, workspace recovery, and product questions.
          For self-hosted operators, support starts with install health, SMTP, backups, restore, and updates.
        </p>
        <h2>Self-Host Checklist</h2>
        <ul>
          <li>Confirm DNS points to the server.</li>
          <li>Confirm ports 80 and 443 are open.</li>
          <li>Run the status script from the install directory.</li>
          <li>Download or create a backup before major updates.</li>
          <li>Use the admin settings page to test SMTP.</li>
        </ul>
        <h2>Account Help</h2>
        <p>
          Use the forgot password link on the login page. If email verification is enabled, use the resend verification link.
        </p>
      </section>
    </main>
  );
}
