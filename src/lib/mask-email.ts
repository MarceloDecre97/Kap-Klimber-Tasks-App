export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "your email";

  const maskedUser = user.length <= 2 ? `${user[0]}•` : `${user[0]}${"•".repeat(Math.min(user.length - 2, 4))}${user[user.length - 1]}`;

  const [domainName, ...rest] = domain.split(".");
  const maskedDomain = domainName
    ? domainName.length <= 2
      ? `${domainName[0]}•`
      : `${domainName[0]}${"•".repeat(Math.min(domainName.length - 2, 4))}${domainName[domainName.length - 1]}`
    : domain;

  return `${maskedUser}@${[maskedDomain, ...rest].join(".")}`;
}
