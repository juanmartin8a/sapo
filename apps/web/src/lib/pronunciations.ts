export type Language = {
	language_code: string;
	name: string;
};

export type Pronunciation = {
	id: string;
	orthographic_form: string;
	source_language_code: string;
	target_language_code: string;
	ipa: string;
	respelling: string;
};

export type PronunciationPage = {
	page: Pronunciation[];
	nextCursor: string | null;
};
