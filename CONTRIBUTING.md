# Contributing to Living Clone

Thank you for your interest in contributing to Living Clone! This document provides guidelines and information about contributing.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Open a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - OS and Node.js version
   - Screenshots if applicable

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and use case
3. Explain why it would be useful

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test on both Windows and Linux if possible
5. Commit with clear message (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/living-clone.git
cd living-clone

# Install dependencies
npm install

# Run in development
node clone.js --help
```

## Code Style

- Use consistent indentation (2 spaces)
- Follow existing code patterns
- Add comments for complex logic
- Keep functions focused and small

## Testing

Test your changes on:
- Windows (PowerShell/CMD)
- Linux (Ubuntu/Kali)
- macOS (if possible)

## Pull Request Guidelines

- One feature per PR
- Clear description of changes
- Reference related issues
- Include screenshots for UI changes
- Ensure no breaking changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Open an issue for any questions about contributing.
