export interface IThemeMeta {
    name: string;
    scheme: 'dark' | 'light';
}

export interface IThemeScope {
    [token: string]: string;
}

export interface IThemeFile {
    meta: IThemeMeta;
    themeValues: {
        root: IThemeScope;
        toolbar?: IThemeScope;
        tabsbar?: IThemeScope;
    };
}

export interface IResolvedTheme {
    meta: IThemeMeta;
    filePath: string;
    root: Record<string, string>;
    toolbar: Record<string, string>;
    tabsbar: Record<string, string>;
}

export interface IThemeEntry {
    name: string;
    filePath: string;
}
