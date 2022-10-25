declare type ElectronHostMessage = { type: 'start' };

declare type ElectronProcessMessage = { type: 'watch'; paths: Array<string> };
