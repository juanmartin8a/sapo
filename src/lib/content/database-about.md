# About the database

Multilingual Phonetic Representations (MPR) connects words across languages with their IPA pronunciations and readable pronunciation guides. It is the open database behind SAPO's public pronunciation browser.

## What an entry contains

A word can be written one way and pronounced another. MPR brings together the written word, its pronunciation in the International Phonetic Alphabet (IPA), and a pronunciation guide called a respelling.

The **source language** is the language the word comes from. The **target language** is the language whose spelling conventions are used for the guide. A respelling helps a reader approximate the source pronunciation; it does not translate the word's meaning.

For example, an English word can have a guide for Spanish speakers:

| Word | Source  | Target  | IPA    | Respelling |
| ---- | ------- | ------- | ------ | ---------- |
| moon | English | Spanish | /muːn/ | mun        |

This is an illustrative example. Reading **mun** using Spanish spelling gives an approximation of the English pronunciation. Some sounds, such as the long vowel here, do not have an exact equivalent in the target language.

A word can have multiple IPA pronunciations, each with guides for speakers of different languages. The database also stores language records and word frequencies; the browser displays the written forms, IPA, and respellings.

## How the database grows

MPR's population tools use AI to generate IPA transcriptions and pronunciation respellings for words in the database. Results are checked against the input words and allowed pronunciation characters. Items flagged for review receive an automated editing pass before being finalized.

Pronunciation can vary with accent, context, and a word's meaning. Generated entries may contain errors, and respellings approximate sounds through another language's writing system. Use them as pronunciation aids rather than exact substitutes for listening to a speaker.

The browser shows the database's live content, so coverage can expand over time. Browsing is read-only. Using the SAPO app does not contribute your input, intermediate translations, or output to this public database.

## Vocabulary source

The written forms and frequency values stored in MPR's word entries come from [wordfreq](https://github.com/rspeer/wordfreq) by **Robyn Speer**. MPR maintains its database schema and generates the IPA transcriptions and pronunciation respellings through its population tools.

## License and reuse

MPR publishes the database under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). This covers its language records, word entries, frequencies, IPA transcriptions, pronunciation respellings, and MPR's rights in the database compilation. The written forms and frequency values sourced from wordfreq retain their license and attribution notices.

When sharing MPR data, credit Multilingual Phonetic Representations, retain the source attribution, include the license or a link to it, and identify your changes. If you modify MPR data and share a version subject to ShareAlike, license that version under CC BY-SA 4.0 or another compatible license. Reuse under CC BY-SA 4.0 does not require separate permission from SAPO.

The database is provided as-is, without warranties, subject to section 5 of the [full data license](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en). The data license applies to the database; software, designs, and branding have their own applicable terms.

See [Data sources & attribution](/multilingual-phonetic-representations/about/attribution/) for the full credits, upstream notices, research citation, and provenance details. The database schema and population tools are available in the [MPR repository](https://github.com/juanmartin8a/multilingual-phonetic-responses).
