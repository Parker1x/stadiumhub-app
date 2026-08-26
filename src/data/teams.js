// StadiumHub — favourite-team picker list.
// Professional football clubs by country/league, as of the 2025–26 season,
// from the model's knowledge. Not exhaustive at the lower tiers; the picker
// also accepts free text so a missing club is never a blocker.

export const TEAMS = [
  // ---- England ------------------------------------------------------------
  // Premier League
  'Arsenal', 'Aston Villa', 'AFC Bournemouth', 'Brentford', 'Brighton & Hove Albion',
  'Burnley', 'Chelsea', 'Crystal Palace', 'Everton', 'Fulham',
  'Leeds United', 'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle United',
  'Nottingham Forest', 'Sunderland', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers',
  // Championship
  'Birmingham City', 'Blackburn Rovers', 'Bristol City', 'Charlton Athletic', 'Coventry City',
  'Derby County', 'Hull City', 'Ipswich Town', 'Leicester City', 'Middlesbrough',
  'Millwall', 'Norwich City', 'Oxford United', 'Portsmouth', 'Preston North End',
  'Queens Park Rangers', 'Sheffield United', 'Sheffield Wednesday', 'Southampton', 'Stoke City',
  'Swansea City', 'Watford', 'West Bromwich Albion', 'Wrexham',
  // League One
  'AFC Wimbledon', 'Barnsley', 'Blackpool', 'Bolton Wanderers', 'Bradford City',
  'Cardiff City', 'Doncaster Rovers', 'Exeter City', 'Huddersfield Town', 'Lincoln City',
  'Luton Town', 'Mansfield Town', 'Northampton Town', 'Peterborough United', 'Plymouth Argyle',
  'Port Vale', 'Reading', 'Rotherham United', 'Stockport County', 'Wigan Athletic',
  'Wycombe Wanderers',
  // League Two
  'Accrington Stanley', 'Barnet', 'Barrow', 'Bromley', 'Cambridge United',
  'Cheltenham Town', 'Chesterfield', 'Colchester United', 'Crawley Town', 'Crewe Alexandra',
  'Eastleigh', 'Fleetwood Town', 'Gillingham', 'Grimsby Town', 'Harrogate Town',
  'Milton Keynes Dons', 'Newport County', 'Notts County', 'Oldham Athletic', 'Salford City',
  'Shrewsbury Town', 'Swindon Town', 'Tranmere Rovers', 'Walsall',
  // National League & notable non-league
  'Aldershot Town', 'Boreham Wood', 'Braintree Town', 'Carlisle United', 'Forest Green Rovers',
  'Gateshead', 'Hartlepool United', 'Southend United', 'Torquay United', 'Woking', 'York City',
  'Scarborough Athletic', 'FC United of Manchester', 'Marine', 'Darlington', 'Hereford',

  // ---- Scotland -----------------------------------------------------------
  'Aberdeen', 'Celtic', 'Rangers', 'Heart of Midlothian', 'Hibernian',
  'Dundee', 'Dundee United', 'Falkirk', 'Kilmarnock', 'Livingston', 'Motherwell', 'St Mirren',
  'St Johnstone', 'Partick Thistle', 'Queen\'s Park', 'Raith Rovers', 'Dunfermline Athletic',
  'Ayr United', 'Arbroath', 'Airdrieonians', 'Greenock Morton', 'Inverness Caledonian Thistle',
  'Hamilton Academical', 'Cove Rangers', 'Montrose', 'Kelty Hearts', 'Dumbarton',
  'Elgin City', 'East Fife', 'Forfar Athletic', 'Peterhead', 'Stenhousemuir',
  'Stirling Albion', 'Stranraer', 'Edinburgh City', 'Bonnyrigg Rose',

  // ---- Wales & Northern Ireland & Republic of Ireland ---------------------
  'The New Saints', 'Connah\'s Quay Nomads', 'Bala Town', 'Newtown', 'Caernarfon Town',
  'Barry Town United', 'Pen-y-Bont', 'Haverfordwest County', 'Aberystwyth Town',
  'Cardiff Metropolitan', 'Briton Ferry Llansawel', 'Colwyn Bay',
  'Linfield', 'Glentoran', 'Larne', 'Coleraine', 'Cliftonville', 'Crusaders',
  'Ballymena United', 'Glenavon', 'Portadown', 'Newry City', 'Dungannon Swifts',
  'Carrick Rangers', 'Bangor', 'Loughgall',
  'Shamrock Rovers', 'Bohemians', 'St Patrick\'s Athletic', 'Dundalk', 'Derry City',
  'Shelbourne', 'Sligo Rovers', 'Waterford', 'Galway United', 'Drogheda United', 'Cork City',

  // ---- Germany ------------------------------------------------------------
  'Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund', 'RB Leipzig', 'Eintracht Frankfurt',
  'VfB Stuttgart', 'SC Freiburg', 'Werder Bremen', 'VfL Wolfsburg', 'Union Berlin',
  'Mainz 05', 'FC Augsburg', 'Borussia Mönchengladbach', 'St. Pauli', 'Heidenheim',
  'TSG Hoffenheim', '1. FC Köln', 'Hamburger SV',
  'Schalke 04', 'Hertha BSC', 'Fortuna Düsseldorf', 'Hannover 96', 'Karlsruher SC',
  'Darmstadt 98', '1. FC Nürnberg', 'SC Paderborn', 'Holstein Kiel', 'VfL Bochum',
  'Arminia Bielefeld', 'Dynamo Dresden', 'Energie Cottbus', 'Preußen Münster',
  'Eintracht Braunschweig', 'Greuther Fürth', '1. FC Kaiserslautern', 'SV Elversberg',
  '1. FC Magdeburg',

  // ---- Spain --------------------------------------------------------------
  'Real Madrid', 'FC Barcelona', 'Atlético Madrid', 'Athletic Club Bilbao', 'Real Sociedad',
  'Real Betis', 'Villarreal', 'Valencia', 'Sevilla', 'Girona',
  'Celta Vigo', 'Rayo Vallecano', 'CA Osasuna', 'Mallorca', 'Getafe',
  'Deportivo Alavés', 'Espanyol', 'Levante', 'Elche', 'Real Oviedo',
  'UD Almería', 'Racing Santander', 'Deportivo La Coruña', 'Sporting Gijón', 'Real Zaragoza',
  'Málaga', 'Granada', 'SD Huesca', 'Las Palmas', 'Leganés',
  'Real Valladolid', 'SD Eibar', 'CD Mirandés', 'Burgos', 'Albacete', 'Cádiz',
  'CD Castellón', 'Córdoba',

  // ---- Italy --------------------------------------------------------------
  'Inter Milan', 'AC Milan', 'Juventus', 'Napoli', 'AS Roma',
  'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino',
  'Udinese', 'Genoa', 'Como', 'Cagliari', 'Hellas Verona',
  'Parma', 'Lecce', 'Sassuolo', 'Pisa', 'Cremonese',
  'Palermo', 'Sampdoria', 'Spezia', 'Venezia', 'Empoli',
  'Monza', 'Bari', 'Frosinone', 'Brescia', 'Catanzaro',

  // ---- France -------------------------------------------------------------
  'Paris Saint-Germain', 'Marseille', 'Lyon', 'AS Monaco', 'Lille',
  'Nice', 'Lens', 'Rennes', 'Strasbourg', 'Nantes',
  'Toulouse', 'Brest', 'Le Havre', 'Angers', 'Metz', 'Lorient',
  'Saint-Étienne', 'Reims', 'Montpellier', 'Auxerre', 'Le Mans',
  'Guingamp', 'Troyes', 'Caen', 'Amiens', 'Bastia', 'Grenoble',
  'Pau', 'Rodez', 'Annecy', 'Dunkerque', 'Clermont Foot', 'Red Star', 'Laval',

  // ---- Netherlands & Belgium & Portugal -----------------------------------
  'Ajax', 'PSV Eindhoven', 'Feyenoord', 'AZ Alkmaar', 'FC Twente',
  'FC Utrecht', 'Sparta Rotterdam', 'Go Ahead Eagles', 'Heerenveen', 'NEC Nijmegen',
  'Fortuna Sittard', 'FC Groningen', 'PEC Zwolle', 'Heracles Almelo', 'Excelsior',
  'Telstar', 'NAC Breda', 'Volendam', 'Roda JC', 'De Graafschap', 'MVV Maastricht',
  'Den Bosch', 'SC Cambuur', 'Emmen', 'FC Dordrecht', 'FC Eindhoven',
  'Helmond Sport', 'TOP Oss', 'Willem II',
  'Club Brugge', 'Anderlecht', 'KRC Genk', 'Union Saint-Gilloise', 'Royal Antwerp',
  'Gent', 'Standard Liège', 'Cercle Brugge', 'Charleroi', 'Mechelen',
  'OH Leuven', 'Westerlo', 'Sint-Truiden', 'Kortrijk', 'Dender', 'Zulte Waregem',
  'Benfica', 'FC Porto', 'Sporting CP', 'SC Braga', 'Vitória Guimarães',
  'Famalicão', 'Moreirense', 'Rio Ave', 'Santa Clara', 'Arouca',
  'Gil Vicente', 'Estoril', 'Casa Pia', 'AVS', 'Tondela', 'Estrela Amadora',

  // ---- Turkey & Greece & Austria & Switzerland ----------------------------
  'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'Başakşehir',
  'Antalyaspor', 'Konyaspor', 'Alanyaspor', 'Kayserispor', 'Sivasspor',
  'Çaykur Rizespor', 'Gaziantep FK', 'Samsunspor', 'Göztepe', 'Eyüpspor', 'Kocaelispor',
  'Olympiacos', 'Panathinaikos', 'AEK Athens', 'PAOK', 'Aris Thessaloniki',
  'OFI Crete', 'Asteras Tripolis', 'Atromitos', 'Volos', 'Levadiakos',
  'Red Bull Salzburg', 'Rapid Vienna', 'Austria Vienna', 'Sturm Graz', 'LASK',
  'Wolfsberger AC', 'TSV Hartberg', 'Austria Klagenfurt', 'Blau-Weiß Linz', 'SV Ried', 'Grazer AK',
  'Young Boys', 'FC Basel', 'Servette', 'FC Zürich', 'St. Gallen',
  'Lugano', 'Lucerne', 'Sion', 'Winterthur', 'Lausanne-Sport', 'Grasshopper Club Zürich',

  // ---- Eastern Europe -----------------------------------------------------
  'Zenit St Petersburg', 'Spartak Moscow', 'CSKA Moscow', 'Lokomotiv Moscow', 'Dynamo Moscow',
  'FC Krasnodar', 'Rostov', 'Rubin Kazan', 'Akron Tolyatti', 'Dynamo Makhachkala',
  'Orenburg', 'Pari Nizhny Novgorod', 'Akhmat Grozny', 'Baltika Kaliningrad',
  'Shakhtar Donetsk', 'Dynamo Kyiv', 'SC Dnipro-1', 'Zorya Luhansk', 'Kryvbas',
  'Oleksandriya', 'Polissya Zhytomyr', 'Veres Rivne', 'Kolos Kovalivka', 'Karpaty Lviv',
  'Legia Warsaw', 'Lech Poznań', 'Raków Częstochowa', 'Jagiellonia Białystok', 'Pogoń Szczecin',
  'Slavia Prague', 'Sparta Prague', 'Viktoria Plzeň', 'Baník Ostrava',
  'Ferencváros', 'Újpest', 'Debrecen',
  'Red Star Belgrade', 'Partizan Belgrade', 'Vojvodina',
  'Dinamo Zagreb', 'Hajduk Split', 'Rijeka',
  'Slovan Bratislava', 'Spartak Trnava',
  'Maribor', 'Olimpija Ljubljana', 'Celje',
  'Ludogorets Razgrad', 'Levski Sofia', 'CSKA Sofia',
  'Steaua Bucharest (FCSB)', 'Dinamo Bucharest', 'Universitatea Craiova', 'Rapid Bucharest',
  'Dinamo Tbilisi',

  // ---- Scandinavia --------------------------------------------------------
  'Malmö FF', 'AIK', 'Djurgården', 'IFK Göteborg', 'Hammarby', 'Norrköping', 'Elfsborg',
  'Häcken', 'Mjällby', 'Sirius', 'Halmstad',
  'Copenhagen', 'Brøndby', 'Midtjylland', 'Nordsjælland', 'Aarhus GF', 'AaB', 'OB', 'Viborg',
  'Rosenborg', 'Molde', 'Bodø/Glimt', 'Viking', 'Brann', 'Lillestrøm', 'Vålerenga', 'Tromsø',
  'HJK Helsinki', 'KuPS', 'Ilves', 'VPS Vaasa',

  // ---- Brazil -------------------------------------------------------------
  'Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Santos',
  'Grêmio', 'Internacional', 'Fluminense', 'Vasco da Gama', 'Botafogo',
  'Cruzeiro', 'Atlético Mineiro', 'Bahia', 'Fortaleza', 'Athletico Paranaense',
  'Red Bull Bragantino', 'Juventude', 'Mirassol', 'Sport Recife', 'Vitória',
  'Ceará', 'Coritiba', 'Goiás', 'Novorizontino', 'Chapecoense',
  'Avaí', 'América Mineiro', 'Ponte Preta', 'Guarani', 'Remo', 'Vila Nova',

  // ---- Argentina & South America ------------------------------------------
  'River Plate', 'Boca Juniors', 'Racing Club', 'Independiente', 'San Lorenzo',
  'Vélez Sarsfield', 'Estudiantes', 'Rosario Central', 'Newell\'s Old Boys', 'Talleres',
  'Lanús', 'Huracán', 'Argentinos Juniors', 'Defensa y Justicia', 'Godoy Cruz',
  'Platense', 'Barracas Central', 'Belgrano', 'Instituto', 'Unión', 'Gimnasia', 'Banfield',
  'Nacional', 'Peñarol', 'Colo-Colo', 'Universidad de Chile', 'U Católica',
  'Atlético Nacional', 'Millonarios', 'Junior', 'América de Cali', 'Deportes Tolima',
  'LDU Quito', 'Barcelona SC', 'Emelec', 'Independiente del Valle',
  'Alianza Lima', 'Universitario', 'Sporting Cristal',
  'The Strongest', 'Bolívar', 'Olimpia', 'Cerro Porteño', 'Libertad',

  // ---- North America ------------------------------------------------------
  'Inter Miami', 'LA Galaxy', 'Los Angeles FC', 'Seattle Sounders', 'Atlanta United',
  'Austin FC', 'Charlotte FC', 'Chicago Fire', 'Colorado Rapids', 'Columbus Crew',
  'DC United', 'FC Cincinnati', 'FC Dallas', 'Houston Dynamo', 'Minnesota United',
  'Nashville SC', 'New England Revolution', 'New York Red Bulls', 'New York City FC',
  'Orlando City', 'Philadelphia Union', 'Portland Timbers', 'Real Salt Lake',
  'San Jose Earthquakes', 'Sporting Kansas City', 'St. Louis City', 'Toronto FC',
  'Vancouver Whitecaps', 'San Diego FC',
  'Club América', 'Chivas Guadalajara', 'Cruz Azul', 'Pumas UNAM', 'Tigres UANL',
  'Monterrey', 'Toluca', 'Pachuca', 'León', 'Santos Laguna', 'Puebla', 'Atlas',
  'Necaxa', 'Club Tijuana', 'Mazatlán', 'Querétaro', 'Atlético San Luis', 'Juárez',

  // ---- Asia & Middle East -------------------------------------------------
  'Al Nassr', 'Al Hilal', 'Al Ittihad', 'Al Ahli Saudi', 'Al Shabab', 'Al Ettifaq',
  'Al Taawoun', 'Al Fateh', 'Al Khaleej', 'Al Riyadh', 'Al Fayha', 'Damac',
  'Al Okhdood', 'Al Wehda', 'Al Kholood', 'Al Qadsiah', 'NEOM SC',
  'Persepolis', 'Esteghlal', 'Sepahan', 'Tractor',
  'Al Sadd', 'Al Duhail', 'Al Rayyan',
  'Sharjah', 'Al Ain', 'Shabab Al Ahli', 'Al Wasl', 'Al Jazira',
  'Al Kuwait', 'Kazma', 'Al Arabi SC',
  'Urawa Red Diamonds', 'Kashima Antlers', 'Kawasaki Frontale', 'Yokohama F. Marinos',
  'Vissel Kobe', 'Gamba Osaka', 'Cerezo Osaka', 'FC Tokyo', 'Sanfrecce Hiroshima',
  'Nagoya Grampus', 'Kyoto Sanga', 'Avispa Fukuoka', 'Consadole Sapporo',
  'Albirex Niigata', 'Tokyo Verdy', 'Shonan Bellmare', 'Kashiwa Reysol', 'Machida Zelvia',
  'Ulsan HD', 'Jeonbuk Hyundai Motors', 'FC Seoul', 'Pohang Steelers', 'Suwon Samsung Bluewings',
  'Guangzhou FC', 'Shanghai Port', 'Shandong Taishan', 'Beijing Guoan', 'Chengdu Rongcheng',
  'Shanghai Shenhua', 'Zhejiang FC',

  // ---- Africa -------------------------------------------------------------
  'Al Ahly', 'Zamalek', 'Pyramids FC', 'Espérance de Tunis', 'Club Africain',
  'Wydad Casablanca', 'Raja Casablanca', 'Mamelodi Sundowns', 'Orlando Pirates',
  'Kaizer Chiefs', 'Simba', 'Yanga', 'Zesco United', 'TP Mazembe',
  'Asante Kotoko', 'Hearts of Oak', 'Enyimba', 'Kano Pillars',
  'Horoya', 'ASEC Mimosas', 'Djoliba', 'Stade Malien',

  // ---- Australia ----------------------------------------------------------
  'Melbourne City', 'Melbourne Victory', 'Sydney FC', 'Western Sydney Wanderers',
  'Adelaide United', 'Brisbane Roar', 'Central Coast Mariners', 'Macarthur FC',
  'Newcastle Jets', 'Perth Glory', 'Wellington Phoenix', 'Western United', 'Auckland FC'
]

export const TEAM_COUNT = TEAMS.length
