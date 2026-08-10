# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Living Clone, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

### Contact

Send an email to: [INSERT EMAIL]

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Time

- Acknowledgment: Within 48 hours
- Initial assessment: Within 1 week
- Fix timeline: Depends on severity

## Scope

### In Scope
- Code execution vulnerabilities
- Path traversal
- Injection flaws
- Authentication bypass
- Other security issues in the tool itself

### Out of Scope
- Issues in third-party dependencies (report to them)
- Issues requiring physical access
- Social engineering

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.0.x | Yes |
| < 2.0 | No |

## Security Best Practices

When using Living Clone:

1. **Only test authorized targets** - Never scan websites without permission
2. **Use isolated environments** - Run in VMs or containers when possible
3. **Keep dependencies updated** - Run `npm audit` regularly
4. **Review injected code** - Always review payloads before injection
5. **Use proxies** - Route traffic through proxies for anonymity
6. **Don't run as root** - Use unprivileged user when possible

## Ethical Use

This tool is designed for:
- Authorized penetration testing
- Security research
- Educational purposes
- Bug bounty programs (within scope)

**Misuse of this tool for unauthorized access is illegal and unethical.**

## Acknowledgments

We appreciate responsible disclosure and will credit reporters (with permission).
