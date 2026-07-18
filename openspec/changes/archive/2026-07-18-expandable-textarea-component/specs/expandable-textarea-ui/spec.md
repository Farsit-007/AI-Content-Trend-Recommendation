## ADDED Requirements

### Requirement: Auto-Growing, Resizable, Expandable Text Entry
The system SHALL provide a reusable text-entry component that grows its visible height with content up to a
configurable maximum before scrolling internally, SHALL allow the user to manually resize it taller via
native vertical resize, and SHALL provide an affordance to open the same value in a full-screen modal editor
whose edits stay synchronized with the inline view in real time. The component SHALL accept the same
`value`/`onChange`/`onBlur`/`name`/`ref` contract as a native `<textarea>` so it can replace one without
adapter code, including inside a react-hook-form field spread.

#### Scenario: Content below the cap grows the box, no scrollbar
- **WHEN** a user types content whose rendered height is less than the configured maximum
- **THEN** the textarea's visible height grows to fit the content exactly, with no internal scrollbar

#### Scenario: Content at or above the cap scrolls internally
- **WHEN** a user types or pastes content whose rendered height exceeds the configured maximum
- **THEN** the textarea's height stops growing at the maximum and an internal scrollbar appears

#### Scenario: Editing in the full-view modal updates the inline view live
- **WHEN** the expand affordance is used to open the full-view modal, and the user edits the text there
- **THEN** the inline textarea's value reflects every keystroke without requiring the modal to be closed first

#### Scenario: Closing the modal never discards changes
- **WHEN** the full-view modal is closed by any means (close button, Escape, backdrop click)
- **THEN** whatever text was present at that moment remains the component's value — nothing reverts

#### Scenario: Drop-in compatibility with a react-hook-form field spread
- **WHEN** the component is rendered with `{...field}` from a react-hook-form `Controller`/`FormField`
- **THEN** it participates in the form's value tracking and validation exactly as a native `<textarea {...field} />` would
