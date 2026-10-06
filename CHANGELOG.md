# Changelog

## 1.3.1
- Removed the legacy in-app AI gateway and legacy Feedback Hub client completely.
- Integrated Universal AI + Feedback Modules for the single AI/Feedback system.
- AI uses the uploaded robot image from the universal module.
- AI widget is isolated with Shadow DOM; calculator UI/business logic remains unchanged.
- Provider discovery, model auto-selection, connection test and stale-model recovery are now provided by the universal module.
- Feedback, unread notices, support/donate data, offline queue, Settings and Logs are provided by the universal modules.
- Calculator-specific App Adapter supplies knowledge, live context and safe actions to the universal AI service.
- Added integration/security/file-inventory tests.

## 1.3.0
- AI as interactive user manual and calculator assistant.
- Tools/actions for safe calculator automation.
- Calculator history and live context for AI.

## 1.2.0
- Original integrated AI + Feedback implementation.

## 1.0.0
- Initial calculator.
