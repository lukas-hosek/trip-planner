/*
	The 15 places shown on the map, with their categories.
	Texts are in Czech because that's the audience of the app.
	Facts and closures were checked in November 2026; `status` describes winter conditions.
*/

export const CATEGORIES = {
	viewpoint: { label: "Vyhlídky", color: "var(--color-viewpoint)" },
	rockFormation: { label: "Skály a brány", color: "var(--color-rock-formation)" },
	castle: { label: "Hrady", color: "var(--color-castle)" },
	leisure: { label: "Pohoda a zajímavosti", color: "var(--color-leisure)" },
};

export const FILTER_ALL_PLACES = "all";
export const FILTER_PLANNED_PLACES = "planned";

export const PLACES = [
	{
		id: "bastei",
		name: "Bastei a Basteibrücke",
		category: "viewpoint",
		latitude: 50.96191,
		longitude: 14.07282,
		plannedDay: "Neděle",
		status: { text: "Most průchozí · Neurathen zavřený", kind: "warning" },
		description: "Nejslavnější místo celého Saského Švýcarska. Pískovcový most z roku 1851 je dlouhý 76,5 metru a spojuje skalní věže 194 metrů nad Labem. Nahradil dřevěnou lávku z roku 1826, postavenou pro první turisty. Kolem mostu je sedm vyhlídek. Skalní hrad Neurathen pod mostem je teď z bezpečnostních důvodů zavřený, ale přes most se normálně chodí. Za podzimních rán tu bývá moře mlhy nad údolím Labe.",
		howToGetThere: "Z Rathenu přívozem a 30–40 minut do schodů, nebo autem na parkoviště Bastei a odtud 10 minut pěšky.",
		wikipediaTitles: { de: ["Basteibrücke", "Bastei (Sächsische Schweiz)"], en: ["Bastei"] },
	},
	{
		id: "schwedenloecher",
		name: "Schwedenlöcher a Amselsee",
		category: "rockFormation",
		latitude: 50.96944,
		longitude: 14.07361,
		plannedDay: "Neděle",
		status: { text: "Znovu otevřeno po letní bouři", kind: "ok" },
		description: "Necelý kilometr dlouhá soutěska, kterou se od Bastei sestupuje po stovkách schodů mezi úzkými, mechem porostlými stěnami. Jméno má z třicetileté války: v srpnu 1639 se sem před švédskými vojáky ukryli sedláci z vypálené vesnice Rathewalde. Dole leží jezírko Amselsee, odkud je to po rovině zpátky do Rathenu. Po bouři z 31. července byla soutěska několik týdnů zavřená, od poloviny srpna je znovu průchozí.",
		howToGetThere: "Nejlepší jako sestup z Bastei do Rathenu. Celý okruh trvá 2,5–3 hodiny.",
		wikipediaTitles: { de: ["Schwedenlöcher", "Amselsee"], en: [] },
	},
	{
		id: "koenigstein",
		name: "Pevnost Königstein",
		category: "castle",
		latitude: 50.91902,
		longitude: 14.05673,
		plannedDay: "Neděle",
		status: { text: "Otevřeno celý rok", kind: "ok" },
		description: "Jedna z největších horských pevností v Evropě. Stojí na skalní plošině o rozloze 9,5 hektaru, 240 metrů nad Labem, a nikdy nebyla dobyta. Uvnitř jsou kasárna, arzenály a expozice o vojenské historii. Krátce tu byl vězněn alchymista Böttger, pozdější vynálezce míšeňského porcelánu. Studna vytesaná do skály v 60. letech 16. století je hluboká 152,5 metru. Z hradeb je jeden z nejlepších pohledů na Lilienstein a ohyb Labe.",
		howToGetThere: "Na plošinu jezdí i panoramatický výtah. Parkoviště je pod pevností.",
		wikipediaTitles: { de: ["Festung Königstein"], en: ["Königstein Fortress"] },
	},
	{
		id: "lilienstein",
		name: "Lilienstein",
		category: "viewpoint",
		latitude: 50.93007,
		longitude: 14.08390,
		description: "Jediná stolová hora na pravém břehu Labe a symbol národního parku, najdete ji v jeho logu. Stojí přímo naproti Königsteinu, takže pevnost odtud vidíte jako na dlani. Skalní stěny jsou vysoké až 80 metrů a nahoru vedou schody a žebříky. Na vrcholu stojí 16metrový obelisk z roku 1889, který připomíná 800 let rodu Wettinů. Několikrát do něj udeřil blesk a v roce 2000 prošel opravou.",
		howToGetThere: "Z parkoviště na Ebenheit je to nahoru zhruba 30–40 minut.",
		wikipediaTitles: { de: ["Lilienstein"], en: ["Lilienstein"] },
	},
	{
		id: "pfaffenstein",
		name: "Pfaffenstein a Barbarine",
		category: "rockFormation",
		latitude: 50.89850,
		longitude: 14.08120,
		description: "Stolová hora vysoká 434,6 metru s bludištěm skalních chodeb, jeskyní a vyhlídek. Nahoru vede štěrbina Nadelöhr, kde se místy protahujete mezi stěnami vzdálenými jen 40 až 50 centimetrů. Na jižním konci stojí Barbarine, 43 metrů vysoká skalní jehla a jeden ze symbolů Saského Švýcarska. Podle pověsti je to zkamenělá dívka, která místo na nedělní mši šla na borůvky. Kvůli erozi je na ni lezení od roku 1975 zakázané.",
		howToGetThere: "Start v Pfaffendorfu u Königsteinu, okruh asi 2,5 hodiny. Na vrcholu je horská restaurace.",
		wikipediaTitles: { de: ["Barbarine", "Pfaffenstein (Sächsische Schweiz)"], en: ["Barbarine", "Pfaffenstein"] },
	},
	{
		id: "schrammsteine",
		name: "Schrammsteine",
		category: "viewpoint",
		latitude: 50.91417,
		longitude: 14.20333,
		description: "Divoký skalní hřeben s osmdesáti vrcholy nad Bad Schandau, podle mnohých nejhezčí túra v oblasti. Cesta vede po žebřících a kovových stupních na Schrammsteinaussicht ve výšce 417 metrů. Odtud uvidíte Labe, stolové hory i Großer Winterberg. Nejvyšší vrchol hřebene, Hoher Torstein, má 425 metrů. Ve středověku tu stála strážní věž Schramensteyn, která hlídala údolí Labe. Už v roce 1456 se o ní psalo jako o zřícenině.",
		howToGetThere: "Okruh z Postelwitz přes Gratweg zabere 4–5 hodin. Za mokra jsou žebříky kluzké.",
		wikipediaTitles: { de: ["Schrammsteine"], en: ["Schrammsteine"] },
	},
	{
		id: "kuhstall",
		name: "Kuhstall a Himmelsleiter",
		category: "rockFormation",
		latitude: 50.92599,
		longitude: 14.25661,
		description: "Druhá největší skalní brána v Labských pískovcích po Pravčické bráně: 11 metrů vysoká a 17 metrů široká. Jméno, v překladu kravín, prý dostala podle toho, že sem místní za třicetileté války schovávali dobytek před Švédy. Podle jiné verze sem ukořistěný dobytek zaháněli loupeživí rytíři z místního hradu. Úzkou skalní puklinou vede strmé schodiště Himmelsleiter, nebeský žebřík, na horní vyhlídku a ke zbytkům hradu.",
		howToGetThere: "Od Lichtenhainer Wasserfall asi 30 minut do kopce. U brány je horský hostinec.",
		wikipediaTitles: { de: ["Kuhstall (Sächsische Schweiz)"], en: ["Kuhstall"] },
	},
	{
		id: "lichtenhain",
		name: "Lichtenhainer Wasserfall a tramvaj",
		category: "leisure",
		latitude: 50.92917,
		longitude: 14.24333,
		status: { text: "Tramvaj v zimě omezeně, ověřte", kind: "warning" },
		description: "Malý vodopád v údolí Kirnitzsch, který v roce 1830 upravili pro turisty. Voda se zadržuje a pak se pustí najednou, takže po spuštění chvíli opravdu hučí. Po povodni v červenci 2021 ho opravili a od podzimu 2024 zase funguje. Je to konečná historické tramvaje Kirnitzschtalbahn, která od roku 1898 jezdí 8 kilometrů z Bad Schandau údolím přes národní park. Za mlhavého dne je už samotná jízda zážitek.",
		howToGetThere: "Tramvaj začíná u Kurparku v Bad Schandau. Od vodopádu se dá dojít ke Kuhstallu.",
		wikipediaTitles: { de: ["Lichtenhainer Wasserfall", "Kirnitzschtalbahn"], en: ["Kirnitzschtalbahn"] },
	},
	{
		id: "winterberg",
		name: "Großer Winterberg",
		category: "viewpoint",
		latitude: 50.89583,
		longitude: 14.25972,
		status: { text: "Občerstvení st–ne", kind: "info" },
		description: "S výškou 556 metrů druhý nejvyšší vrch Saského Švýcarska. Na rozdíl od okolí není z pískovce: vrchol tvoří čedič, pozůstatek dávné sopečné činnosti, a roste na něm jeden z největších bukových lesů v Sasku. Horský hotel ve švýcarském stylu tu stojí od 40. let 19. století. Restaurace je od roku 2018 zavřená a funguje jen občerstvení. Výhled je hlavně z rozhledny vedle budovy, protože stromy kolem vrcholu vyrostly.",
		howToGetThere: "Ze Schmilky strmým Bergsteigem asi 2 hodiny nahoru.",
		wikipediaTitles: { de: ["Großer Winterberg"], en: ["Großer Winterberg"] },
	},
	{
		id: "pravcicka",
		name: "Pravčická brána",
		category: "rockFormation",
		latitude: 50.88378,
		longitude: 14.28152,
		plannedDay: "Sobota",
		status: { text: "Do března pá–ne 10–16", kind: "warning" },
		description: "Největší přírodní pískovcová brána v Evropě s rozpětím 26,5 metru a výškou otvoru 16 metrů. Na samotný oblouk se od roku 1982 nesmí, protože ho poškozovala eroze od davů turistů. Lepší výhledy jsou stejně z okolních skalních plošin. Pod bránou stojí zámeček Sokolí hnízdo z roku 1881 s restaurací. Brána si zahrála v Letopisech Narnie. Vstup do areálu je placený a v zimě je otevřeno jen od pátku do neděle.",
		howToGetThere: "Z Hřenska asi 40 minut do kopce. Gabrielina stezka z Mezní Louky je zavřená.",
		wikipediaTitles: { de: ["Prebischtor"], en: ["Pravčická brána"] },
	},
	{
		id: "vytah",
		name: "Výtah v Bad Schandau",
		category: "leisure",
		latitude: 50.91658,
		longitude: 14.16117,
		plannedDay: "Pondělí",
		status: { text: "Zimní provoz ověřte", kind: "warning" },
		description: "Secesní ocelový výtah (Personenaufzug) z roku 1904, otevřený o Velikonocích 1905. Věž je vysoká 52 metrů a vyveze vás o 48 metrů výš na plošinu Ostrau nad městem. Z horní stanice vede 28 metrů dlouhá lávka na skálu s výhledem na Bad Schandau, Labe a Schrammsteine. Krátký výlet na pondělní dopoledne, kdy se nikam daleko nechce.",
		howToGetThere: "Kousek od centra Bad Schandau. Nahoře můžete navázat procházkou po Ostrau.",
		wikipediaTitles: { de: ["Personenaufzug Bad Schandau"], en: ["Bad Schandau"] },
	},
	{
		id: "therme",
		name: "Toskana Therme",
		category: "leisure",
		latitude: 50.91654,
		longitude: 14.15623,
		plannedDay: "Pondělí",
		description: "Termální lázně se slanou vodou přímo na břehu Labe v Bad Schandau. Mají čtyři vnitřní bazény, saunový svět s osmi saunami včetně panoramatické a hlavně Liquid Sound: v bazénu pod kupolí hraje hudba, kterou slyšíte pod vodou, a na strop se promítají světelné obrazy. Po listopadovém dni venku ideální zakončení. S kartou hosta Gästekarte je vstup o něco levnější.",
		howToGetThere: "Asi 300 metrů od náměstí směrem k hranici. Parkoviště má závoru.",
		wikipediaTitles: { de: ["Toskana Therme Bad Schandau", "Bad Schandau"], en: ["Bad Schandau"] },
	},
	{
		id: "brand",
		name: "Brand, balkon Saského Švýcarska",
		category: "viewpoint",
		// Approximate position (within a few hundred metres); no authoritative coordinates were found.
		latitude: 50.9552,
		longitude: 14.1250,
		status: { text: "Brand-Baude v zimě 11–17", kind: "info" },
		description: "Skalní plošina ve výšce 317 metrů, 177 metrů nad řekou Polenz, s jedním z nejslavnějších výhledů v oblasti. Vidíte odtud stolové hory, Lilienstein i Schrammsteine a turisté sem chodili už kolem roku 1800. Hostinec Brand-Baude tu má tradici asi 200 let. Z Hohnsteinu vede 2,5 km dlouhá rovná cesta, pro sportovnější je tu výstup po zhruba 850 schodech Brandstufen z údolí Tiefer Grund.",
		howToGetThere: "Dobře se spojí s hradem Hohnstein, okruh trvá asi 2 hodiny.",
		wikipediaTitles: { de: ["Brand (Sächsische Schweiz)", "Brandaussicht"], en: ["Brand (Saxon Switzerland)"] },
	},
	{
		id: "hohnstein",
		name: "Hrad Hohnstein",
		category: "castle",
		latitude: 50.97972,
		longitude: 14.10944,
		description: "Hrad z doby kolem roku 1200 na skále nad údolím Polenz. Ze všech hradů na pravém břehu Labe v Saském Švýcarsku je jediný, který se dochoval celý. V roce 1926 se z něj stala mládežnická ubytovna, tehdy s tisícem lůžek největší v Německu. V letech 1933–34 tu nacisté zřídili koncentrační tábor pro politické vězně. Městečko pod hradem je známé loutkářskou tradicí hohnsteinského Kašpárka.",
		howToGetThere: "Z hradu je to 2,5 kilometru na Brand.",
		wikipediaTitles: { de: ["Burg Hohnstein (Sächsische Schweiz)"], en: ["Hohnstein Castle (Saxon Switzerland)"] },
	},
	{
		id: "schmilka",
		name: "Schmilka",
		category: "leisure",
		latitude: 50.8915,
		longitude: 14.2305,
		description: "Malá vesnice přímo na hranici, naproti Hřensku. Jejím srdcem je vodní mlýn z roku 1665 na potoce Ilmenbach. V roce 2007 ho obnovili a dnes v něm peče bio pekárna. Na zahrádce u mlýna se čepuje bio pivo z místního pivovaru Brauhaus Schmilka. Hodí se na oběd cestou do Česka nebo jako výchozí bod na Großer Winterberg.",
		howToGetThere: "Leží na silnici mezi Bad Schandau a Hřenskem, asi 10 minut autem z Bad Schandau.",
		wikipediaTitles: { de: ["Schmilka"], en: ["Schmilka"] },
	},
];

export function findPlaceById(placeId) {
	return PLACES.find(place => place.id === placeId) ?? null;
}

/** The number printed on the pin and in the list; it follows the order of PLACES. */
export function getPlaceNumber(place) {
	return PLACES.indexOf(place) + 1;
}

export function getCategoryOf(place) {
	return CATEGORIES[place.category];
}

export function placeMatchesFilter(place, filterId) {
	if (filterId === FILTER_ALL_PLACES) {
		return true;
	}
	if (filterId === FILTER_PLANNED_PLACES) {
		return Boolean(place.plannedDay);
	}
	return place.category === filterId;
}
