# Release fonts

Production releases must include PBF glyph ranges for the font stack declared by `plainMapStyle()`:
`Be Vietnam Pro Regular`.

The GitHub Actions workflow should copy the generated font directory into the release prefix before activation. Keep the font files versioned and verify Vietnamese ranges during the release check.
