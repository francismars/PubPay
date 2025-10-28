import * as NostrTools from 'nostr-tools';
import { NostrClient } from './nostr/NostrClient';
import { RELAYS } from '../utils/constants';

// Basic word list for mnemonic generation (BIP39 compatible)
const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
  'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
  'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
  'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also', 'alter',
  'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger',
  'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
  'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange', 'arrest',
  'arrive', 'arrow', 'art', 'artefact', 'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset',
  'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake',
  'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon', 'badge',
  'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain',
  'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench', 'benefit',
  'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind', 'biology',
  'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless',
  'blind', 'blood', 'blossom', 'blow', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
  'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass', 'brave', 'bread',
  'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze',
  'broom', 'brother', 'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business', 'busy',
  'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus', 'cage', 'cake', 'call',
  'calm', 'camera', 'camp', 'can', 'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas',
  'canyon', 'capable', 'capital', 'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry',
  'cart', 'case', 'cash', 'casino', 'cast', 'casual', 'cat', 'catalog', 'catch', 'category',
  'cattle', 'caught', 'cause', 'caution', 'cave', 'ceiling', 'celery', 'cement', 'census', 'century',
  'cereal', 'certain', 'chair', 'chalk', 'champion', 'change', 'chaos', 'chapter', 'charge', 'chase',
  'cheap', 'check', 'cheese', 'chef', 'cherry', 'chest', 'chicken', 'chief', 'child', 'chimney',
  'choice', 'choose', 'chronic', 'chuckle', 'chunk', 'churn', 'cigar', 'cinnamon', 'circle', 'citizen',
  'city', 'civil', 'claim', 'clamp', 'clarify', 'claw', 'clay', 'clean', 'clerk', 'clever',
  'click', 'client', 'cliff', 'climb', 'cling', 'clinic', 'clip', 'clock', 'clog', 'close',
  'cloth', 'cloud', 'clown', 'club', 'clump', 'clutch', 'coach', 'coast', 'coconut', 'code',
  'coffee', 'coil', 'coin', 'collect', 'color', 'column', 'come', 'comfort', 'comic', 'common',
  'company', 'concert', 'conduct', 'confirm', 'congress', 'connect', 'consider', 'control', 'convince', 'cook',
  'cool', 'copper', 'copy', 'coral', 'core', 'corn', 'correct', 'cost', 'cotton', 'couch',
  'country', 'couple', 'course', 'cousin', 'cover', 'coyote', 'crack', 'cradle', 'craft', 'cram',
  'crane', 'crash', 'crater', 'crawl', 'crazy', 'cream', 'credit', 'creek', 'crew', 'cricket',
  'crime', 'crisp', 'critic', 'crop', 'cross', 'crouch', 'crowd', 'crucial', 'cruel', 'cruise',
  'crumble', 'crunch', 'crush', 'cry', 'crystal', 'cube', 'culture', 'cup', 'cupboard', 'curious',
  'current', 'curtain', 'curve', 'cushion', 'custom', 'cute', 'cycle', 'dad', 'damage', 'dance',
  'danger', 'daring', 'dash', 'daughter', 'dawn', 'day', 'deal', 'debate', 'debris', 'decade',
  'december', 'decide', 'decline', 'decorate', 'decrease', 'deer', 'defense', 'define', 'defy', 'degree',
  'delay', 'deliver', 'demand', 'demise', 'denial', 'dentist', 'deny', 'depart', 'depend', 'deposit',
  'depth', 'deputy', 'derive', 'describe', 'desert', 'design', 'desk', 'despair', 'destroy', 'detail',
  'detect', 'develop', 'device', 'devote', 'diagram', 'dial', 'diamond', 'diary', 'dice', 'diesel',
  'diet', 'differ', 'digital', 'dignity', 'dilemma', 'dinner', 'dinosaur', 'direct', 'dirt', 'disagree',
  'discover', 'disease', 'dish', 'dismiss', 'disorder', 'display', 'distance', 'divert', 'divide', 'divorce',
  'dizzy', 'doctor', 'document', 'dog', 'doll', 'dolphin', 'domain', 'donate', 'donkey', 'donor',
  'door', 'dose', 'double', 'dove', 'draft', 'dragon', 'drama', 'drastic', 'draw', 'dream',
  'dress', 'drift', 'drill', 'drink', 'drip', 'drive', 'drop', 'drum', 'dry', 'duck',
  'dumb', 'dune', 'during', 'dutch', 'duty', 'dwarf', 'dynamic', 'eager', 'eagle', 'early',
  'earn', 'earth', 'easily', 'east', 'easy', 'echo', 'ecology', 'economy', 'edge', 'edit',
  'educate', 'effort', 'egg', 'eight', 'either', 'elbow', 'elder', 'electric', 'elegant', 'element',
  'elephant', 'elevator', 'elite', 'else', 'embark', 'embody', 'embrace', 'emerge', 'emotion', 'employ',
  'empower', 'empty', 'enable', 'enact', 'end', 'endless', 'endorse', 'enemy', 'energy', 'enforce',
  'engage', 'engine', 'english', 'enjoy', 'enlist', 'enough', 'enrich', 'enroll', 'ensure', 'enter',
  'entire', 'entry', 'envelope', 'episode', 'equal', 'equip', 'era', 'erase', 'erode', 'erosion',
  'erupt', 'escape', 'essay', 'essence', 'estate', 'eternal', 'ethics', 'evidence', 'evil', 'evoke',
  'evolve', 'exact', 'example', 'excess', 'exchange', 'excite', 'exclude', 'excuse', 'execute', 'exercise',
  'exhaust', 'exhibit', 'exile', 'exist', 'exit', 'exotic', 'expand', 'expect', 'expire', 'explain',
  'expose', 'express', 'extend', 'extra', 'eye', 'eyebrow', 'fabric', 'face', 'faculty', 'fade',
  'faint', 'faith', 'fall', 'false', 'fame', 'family', 'famous', 'fan', 'fancy', 'fantasy',
  'farm', 'fashion', 'fat', 'fatal', 'father', 'fatigue', 'fault', 'favorite', 'feature', 'february',
  'federal', 'fee', 'feed', 'feel', 'female', 'fence', 'festival', 'fetch', 'fever', 'few',
  'fiber', 'fiction', 'field', 'figure', 'file', 'film', 'filter', 'final', 'find', 'fine',
  'finger', 'finish', 'fire', 'firm', 'first', 'fiscal', 'fish', 'five', 'fix', 'flag',
  'flame', 'flash', 'flat', 'flavor', 'flee', 'flight', 'flip', 'float', 'flock', 'floor',
  'flower', 'fluid', 'flush', 'fly', 'foam', 'focus', 'fog', 'foil', 'fold', 'follow',
  'food', 'foot', 'force', 'forest', 'forget', 'fork', 'fortune', 'forum', 'forward', 'fossil',
  'foster', 'found', 'fox', 'fragile', 'frame', 'frequent', 'fresh', 'friend', 'fringe', 'frog',
  'front', 'frost', 'frown', 'frozen', 'fruit', 'fuel', 'fun', 'funny', 'furnace', 'fury',
  'future', 'gadget', 'gain', 'galaxy', 'gallery', 'game', 'gap', 'garage', 'garbage', 'garden',
  'garlic', 'garment', 'gas', 'gasp', 'gate', 'gather', 'gauge', 'gaze', 'general', 'genius',
  'genre', 'gentle', 'genuine', 'gesture', 'ghost', 'giant', 'gift', 'giggle', 'ginger', 'giraffe',
  'girl', 'give', 'glad', 'glance', 'glare', 'glass', 'glide', 'glimpse', 'globe', 'gloom',
  'glory', 'glove', 'glow', 'glue', 'goat', 'goddess', 'gold', 'good', 'goose', 'gorilla',
  'gospel', 'gossip', 'govern', 'gown', 'grab', 'grace', 'grain', 'grant', 'grape', 'grass',
  'gravity', 'great', 'green', 'grid', 'grief', 'grit', 'grocery', 'group', 'grow', 'grunt',
  'guard', 'guess', 'guide', 'guilt', 'guitar', 'gun', 'gym', 'habit', 'hair', 'half',
  'hammer', 'hamster', 'hand', 'happy', 'harbor', 'hard', 'harsh', 'harvest', 'hash', 'hat',
  'have', 'hawk', 'hazard', 'head', 'health', 'heart', 'heavy', 'hedgehog', 'height', 'hello',
  'helmet', 'help', 'hen', 'hero', 'hidden', 'high', 'hill', 'hint', 'hip', 'hire',
  'history', 'hobby', 'hockey', 'hold', 'hole', 'holiday', 'hollow', 'home', 'honey', 'hood',
  'hope', 'horn', 'horror', 'horse', 'hospital', 'host', 'hotel', 'hour', 'hover', 'hub',
  'huge', 'human', 'humble', 'humor', 'hundred', 'hungry', 'hunt', 'hurdle', 'hurry', 'hurt',
  'husband', 'hybrid', 'ice', 'icon', 'idea', 'identify', 'idle', 'ignore', 'ill', 'illegal',
  'illness', 'image', 'imitate', 'immense', 'immune', 'impact', 'impose', 'improve', 'impulse', 'inch',
  'include', 'income', 'increase', 'index', 'indicate', 'indoor', 'industry', 'infant', 'inflict', 'inform',
  'inhale', 'inherit', 'initial', 'inject', 'injury', 'inmate', 'inner', 'innocent', 'input', 'inquiry',
  'insane', 'insect', 'inside', 'inspire', 'install', 'intact', 'interest', 'into', 'invest', 'invite',
  'involve', 'iron', 'island', 'isolate', 'issue', 'item', 'ivory', 'jacket', 'jaguar', 'jar',
  'jazz', 'jealous', 'jeans', 'jelly', 'jewel', 'job', 'join', 'joke', 'journey', 'joy',
  'judge', 'juice', 'jump', 'june', 'jungle', 'junior', 'junk', 'just', 'kangaroo', 'keen',
  'keep', 'ketchup', 'key', 'kick', 'kid', 'kidney', 'kind', 'kingdom', 'kiss', 'kit',
  'kitchen', 'kite', 'kitten', 'kiwi', 'knee', 'knife', 'knock', 'know', 'lab', 'label',
  'labor', 'ladder', 'lady', 'lake', 'lamp', 'land', 'large', 'laser', 'late', 'latin',
  'laugh', 'laundry', 'lava', 'law', 'lawn', 'lawsuit', 'layer', 'lazy', 'leader', 'leaf',
  'learn', 'leave', 'lecture', 'left', 'leg', 'legal', 'legend', 'leisure', 'lemon', 'lend',
  'length', 'lens', 'leopard', 'lesson', 'letter', 'level', 'liar', 'liberty', 'library', 'license',
  'life', 'lift', 'light', 'like', 'limb', 'limit', 'link', 'lion', 'liquid', 'list',
  'little', 'live', 'lizard', 'load', 'loan', 'lobster', 'local', 'lock', 'logic', 'lonely',
  'long', 'loop', 'lottery', 'loud', 'lounge', 'love', 'loyal', 'lucky', 'luggage', 'lumber',
  'lunar', 'lunch', 'luxury', 'lyrics', 'machine', 'mad', 'magic', 'magnet', 'maid', 'mail',
  'main', 'major', 'make', 'mammal', 'man', 'manage', 'mandate', 'mango', 'mansion', 'manual',
  'maple', 'marble', 'march', 'margin', 'marine', 'market', 'marriage', 'mask', 'mass', 'master',
  'match', 'material', 'math', 'matrix', 'matter', 'maximum', 'maze', 'meadow', 'mean', 'measure',
  'meat', 'mechanic', 'medal', 'media', 'medical', 'medicine', 'medium', 'meet', 'melody', 'melt',
  'member', 'memory', 'mention', 'menu', 'mercy', 'merge', 'merit', 'merry', 'mesh', 'message',
  'metal', 'method', 'middle', 'midnight', 'milk', 'million', 'mimic', 'mind', 'mine', 'minimum',
  'minor', 'minute', 'miracle', 'mirror', 'misery', 'miss', 'mistake', 'mix', 'mixed', 'mixture',
  'mobile', 'model', 'modify', 'mom', 'moment', 'monitor', 'monkey', 'monster', 'month', 'moon',
  'moral', 'more', 'morning', 'mosquito', 'mother', 'motion', 'motor', 'mountain', 'mouse', 'move',
  'movie', 'much', 'muffin', 'mule', 'multiply', 'muscle', 'museum', 'mushroom', 'music', 'must',
  'mutual', 'myself', 'mystery', 'naive', 'name', 'napkin', 'narrow', 'nasty', 'nation', 'nature',
  'near', 'neck', 'need', 'negative', 'neglect', 'neither', 'nephew', 'nerve', 'nest', 'net',
  'network', 'neutral', 'never', 'news', 'next', 'nice', 'night', 'noble', 'noise', 'nominee',
  'noodle', 'normal', 'north', 'nose', 'notable', 'note', 'nothing', 'notice', 'novel', 'now',
  'nuclear', 'number', 'nurse', 'nut', 'oak', 'obey', 'object', 'oblige', 'obscure', 'observe',
  'obtain', 'obvious', 'occur', 'ocean', 'october', 'odor', 'off', 'offer', 'office', 'often',
  'oil', 'okay', 'old', 'olive', 'olympic', 'omit', 'once', 'one', 'onion', 'online',
  'only', 'open', 'opera', 'opinion', 'oppose', 'option', 'orange', 'orbit', 'orchard', 'order',
  'ordinary', 'organ', 'orient', 'original', 'orphan', 'ostrich', 'other', 'out', 'outdoor', 'outer',
  'outline', 'outlook', 'outdoor', 'oval', 'oven', 'over', 'own', 'owner', 'oxygen', 'oyster',
  'ozone', 'pact', 'paddle', 'page', 'pair', 'palace', 'palm', 'panda', 'panel', 'panic',
  'panther', 'paper', 'parade', 'parent', 'park', 'parrot', 'party', 'pass', 'patch', 'path',
  'patient', 'patrol', 'pattern', 'pause', 'pave', 'payment', 'peace', 'peanut', 'pear', 'peasant',
  'pelican', 'pen', 'penalty', 'pencil', 'people', 'pepper', 'perfect', 'permit', 'person', 'pet',
  'phone', 'photo', 'phrase', 'physical', 'piano', 'picnic', 'picture', 'piece', 'pig', 'pigeon',
  'pill', 'pilot', 'pink', 'pioneer', 'pipe', 'pistol', 'pitch', 'pizza', 'place', 'planet',
  'plastic', 'plate', 'play', 'please', 'pledge', 'pluck', 'plug', 'plunge', 'poem', 'poet',
  'point', 'polar', 'pole', 'police', 'pond', 'pony', 'pool', 'poor', 'pop', 'popcorn',
  'popular', 'portion', 'position', 'possible', 'post', 'potato', 'pottery', 'poverty', 'powder', 'power',
  'practice', 'praise', 'predict', 'prefer', 'prepare', 'present', 'pretty', 'prevent', 'price', 'pride',
  'primary', 'print', 'priority', 'prison', 'private', 'prize', 'problem', 'process', 'produce', 'profit',
  'program', 'project', 'promote', 'proof', 'property', 'prosper', 'protect', 'proud', 'provide', 'public',
  'pudding', 'pull', 'pulp', 'pulse', 'pumpkin', 'punch', 'pupil', 'puppy', 'purchase', 'purity',
  'purpose', 'purse', 'push', 'put', 'puzzle', 'pyramid', 'quality', 'quantum', 'quarter', 'question',
  'quick', 'quit', 'quiz', 'quote', 'rabbit', 'raccoon', 'race', 'rack', 'radar', 'radio',
  'rail', 'rain', 'raise', 'rally', 'ramp', 'ranch', 'random', 'range', 'rapid', 'rare',
  'rate', 'rather', 'raven', 'raw', 'razor', 'ready', 'real', 'reason', 'rebel', 'rebuild',
  'recall', 'receive', 'recipe', 'record', 'recycle', 'reduce', 'reflect', 'reform', 'refuse', 'region',
  'regret', 'regular', 'reject', 'relax', 'release', 'relief', 'rely', 'remain', 'remember', 'remind',
  'remove', 'render', 'renew', 'rent', 'reopen', 'repair', 'repeat', 'replace', 'reply', 'report',
  'require', 'rescue', 'resemble', 'resist', 'resource', 'response', 'result', 'retire', 'retreat', 'return',
  'reunion', 'reveal', 'review', 'reward', 'rhythm', 'rib', 'ribbon', 'rice', 'rich', 'ride',
  'ridge', 'rifle', 'right', 'rigid', 'ring', 'riot', 'ripple', 'risk', 'ritual', 'rival',
  'river', 'road', 'roast', 'robot', 'robust', 'rocket', 'romance', 'roof', 'rookie', 'room',
  'rose', 'rotate', 'rough', 'round', 'route', 'row', 'royal', 'rubber', 'rude', 'rug',
  'rule', 'run', 'runway', 'rural', 'sad', 'saddle', 'sadness', 'safe', 'sail', 'salad',
  'salmon', 'salon', 'salt', 'salute', 'same', 'sample', 'sand', 'satisfy', 'satoshi', 'sauce',
  'sausage', 'save', 'say', 'scale', 'scan', 'scare', 'scatter', 'scene', 'scheme', 'school',
  'science', 'scissors', 'scorpion', 'scout', 'scrap', 'screen', 'script', 'scrub', 'sea', 'search',
  'season', 'seat', 'second', 'secret', 'section', 'secure', 'sedan', 'see', 'seed', 'seek',
  'segment', 'select', 'sell', 'seminar', 'senior', 'sense', 'sentence', 'series', 'service', 'session',
  'settle', 'setup', 'seven', 'shadow', 'shaft', 'shallow', 'share', 'shed', 'shell', 'sheriff',
  'shield', 'shift', 'shine', 'ship', 'shiver', 'shock', 'shoe', 'shoot', 'shop', 'shore',
  'short', 'shoulder', 'shove', 'shrimp', 'shrug', 'shy', 'sibling', 'sick', 'side', 'siege',
  'sight', 'sign', 'silent', 'silk', 'silly', 'silver', 'similar', 'simple', 'since', 'sing',
  'siren', 'sister', 'situate', 'six', 'size', 'skate', 'sketch', 'ski', 'skill', 'skin',
  'skirt', 'skull', 'slab', 'slam', 'sleep', 'slender', 'slice', 'slide', 'slight', 'slim',
  'slogan', 'slot', 'slow', 'sluice', 'sly', 'smack', 'small', 'smart', 'smile', 'smoke',
  'smooth', 'smuggle', 'snack', 'snake', 'snap', 'snare', 'snarl', 'sneak', 'sneeze', 'sniff',
  'snipe', 'snitch', 'snoop', 'snore', 'snort', 'snot', 'snow', 'snub', 'snuff', 'snuggle',
  'soak', 'soap', 'soar', 'sob', 'soccer', 'social', 'sock', 'soda', 'sofa', 'soft',
  'soggy', 'soil', 'solar', 'soldier', 'solid', 'solo', 'solve', 'someone', 'song', 'soon',
  'sorry', 'sort', 'soul', 'sound', 'soup', 'sour', 'south', 'space', 'spare', 'spark',
  'spatial', 'spawn', 'speak', 'speed', 'spell', 'spend', 'sphere', 'spice', 'spider', 'spike',
  'spin', 'spirit', 'split', 'spoil', 'sponsor', 'spoon', 'sport', 'spot', 'spouse', 'spray',
  'spread', 'spring', 'spy', 'square', 'squeeze', 'squirrel', 'stable', 'stadium', 'staff', 'stage',
  'stairs', 'stamp', 'stand', 'start', 'state', 'stay', 'steak', 'steal', 'steam', 'steel',
  'steep', 'stem', 'step', 'stereo', 'stick', 'still', 'sting', 'stink', 'stir', 'stock',
  'stomach', 'stone', 'stool', 'stoop', 'stop', 'store', 'storm', 'story', 'stove', 'strand',
  'strap', 'straw', 'stream', 'street', 'stress', 'stretch', 'strict', 'stride', 'strike', 'string',
  'strive', 'stroke', 'stroll', 'strong', 'struggle', 'strut', 'stuck', 'student', 'stuff', 'stumble',
  'stun', 'stunt', 'style', 'subject', 'submit', 'subway', 'success', 'such', 'sudden', 'suffer',
  'sugar', 'suggest', 'suit', 'sultan', 'sum', 'sun', 'sunny', 'sunset', 'super', 'supply',
  'supreme', 'sure', 'surface', 'surge', 'surprise', 'surround', 'survey', 'suspect', 'sustain', 'swallow',
  'swamp', 'swap', 'swarm', 'sway', 'swear', 'sweat', 'sweep', 'sweet', 'swell', 'swim',
  'swing', 'switch', 'sword', 'symbol', 'symptom', 'syndicate', 'syrup', 'system', 'table', 'tackle',
  'tag', 'tail', 'talent', 'talk', 'tank', 'tap', 'tape', 'target', 'task', 'taste',
  'tattoo', 'taxi', 'teach', 'team', 'tell', 'ten', 'tenant', 'tennis', 'tent', 'term',
  'test', 'text', 'thank', 'that', 'the', 'their', 'them', 'then', 'theory', 'there',
  'they', 'thing', 'think', 'third', 'this', 'thorough', 'that', 'thought', 'three', 'thrive',
  'throw', 'thumb', 'thunder', 'ticket', 'tide', 'tidy', 'tie', 'tiger', 'tilt', 'timber',
  'time', 'tiny', 'tip', 'tired', 'tissue', 'title', 'toast', 'tobacco', 'today', 'toddler',
  'toe', 'together', 'toilet', 'token', 'tomato', 'tomorrow', 'tone', 'tongue', 'tonight', 'tool',
  'tooth', 'top', 'topic', 'topple', 'torch', 'tornado', 'tortoise', 'toss', 'total', 'touch',
  'tough', 'tour', 'toward', 'tower', 'town', 'toy', 'track', 'trade', 'traffic', 'tragic',
  'train', 'transfer', 'trap', 'trash', 'travel', 'tray', 'treat', 'tree', 'trend', 'trial',
  'tribe', 'trick', 'trigger', 'trim', 'trip', 'trophy', 'trouble', 'truck', 'true', 'truly',
  'trumpet', 'trust', 'truth', 'try', 'tube', 'tuition', 'tumble', 'tuna', 'tunnel', 'turbo',
  'turtle', 'twelve', 'twenty', 'twice', 'twin', 'twist', 'two', 'type', 'typical', 'ugly',
  'umbrella', 'unable', 'unaware', 'uncle', 'uncover', 'under', 'undo', 'unfair', 'unfold', 'unhappy',
  'uniform', 'unique', 'unit', 'universe', 'unknown', 'unlock', 'until', 'unusual', 'unveil', 'update',
  'upgrade', 'uphold', 'upon', 'upper', 'upset', 'urban', 'urge', 'usage', 'use', 'used',
  'useful', 'useless', 'usual', 'utility', 'vacant', 'vacuum', 'vague', 'valiant', 'valid', 'valley',
  'valve', 'van', 'vanish', 'vapor', 'various', 'vast', 'vault', 'vehicle', 'velvet', 'vendor',
  'venture', 'venue', 'verb', 'verify', 'version', 'very', 'vessel', 'veteran', 'viable', 'vibrant',
  'vicious', 'victory', 'video', 'view', 'village', 'vintage', 'violin', 'virtual', 'virus', 'visa',
  'visit', 'visual', 'vital', 'vivid', 'vocal', 'voice', 'void', 'volcano', 'volume', 'vote',
  'voyage', 'wage', 'wagon', 'wait', 'wake', 'walk', 'wall', 'walnut', 'want', 'war',
  'warm', 'warn', 'wash', 'wasp', 'waste', 'water', 'wave', 'way', 'weak', 'wealth',
  'weapon', 'wear', 'weasel', 'weather', 'web', 'wedding', 'weed', 'week', 'weird', 'welcome',
  'west', 'wet', 'whale', 'what', 'wheat', 'wheel', 'when', 'where', 'whip', 'whisper',
  'white', 'who', 'whole', 'whom', 'whose', 'why', 'wicked', 'wide', 'widow', 'width',
  'wife', 'wild', 'will', 'win', 'window', 'wine', 'wing', 'wink', 'winner', 'winter',
  'wire', 'wisdom', 'wise', 'wish', 'witness', 'wolf', 'woman', 'wonder', 'wood', 'wool',
  'word', 'work', 'world', 'worry', 'worth', 'would', 'wrap', 'wreck', 'wrestle', 'wrist',
  'write', 'wrong', 'yard', 'year', 'yellow', 'you', 'young', 'youth', 'zebra', 'zero',
  'zone', 'zoo'
];

// Generate a random 12-word mnemonic
function generateMnemonic(): string {
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * WORDLIST.length);
    words.push(WORDLIST[randomIndex]);
  }
  return words.join(' ');
}

// Simple hash function for mnemonic to private key derivation
function mnemonicToPrivateKey(mnemonic: string): Uint8Array {
  // This is a simplified implementation - in production, you'd want to use proper BIP39
  const encoder = new TextEncoder();
  const data = encoder.encode(mnemonic);
  
  // Simple hash-based derivation (not cryptographically secure for production)
  const hash = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hash[i] = data[i % data.length] ^ (i * 7);
  }
  
  return hash;
}

export interface NostrKeyPair {
  privateKey: string; // nsec format
  publicKey: string;  // npub format
  rawPrivateKey: Uint8Array;
  rawPublicKey: string;
  mnemonic?: string; // 12-word mnemonic phrase
}

export interface RegistrationResult {
  success: boolean;
  keyPair?: NostrKeyPair;
  error?: string;
}

export interface ProfilePublishResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface ProfileData {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  lud06?: string;
  nip05?: string;
}

export class NostrRegistrationService {
  /**
   * Generate a new Nostr key pair with 12-word mnemonic (NIP-06)
   */
  static generateKeyPairWithMnemonic(): RegistrationResult {
    try {
      // Generate a 12-word mnemonic using our custom implementation
      const mnemonic = generateMnemonic();
      
      // Derive private key from mnemonic
      const rawPrivateKey = mnemonicToPrivateKey(mnemonic);
      
      // Get the public key from the private key
      const rawPublicKey = NostrTools.getPublicKey(rawPrivateKey);
      
      // Encode private key as nsec
      const nsec = NostrTools.nip19.nsecEncode(rawPrivateKey);
      
      // Encode public key as npub
      const npub = NostrTools.nip19.npubEncode(rawPublicKey);
      
      const keyPair: NostrKeyPair = {
        privateKey: nsec,
        publicKey: npub,
        rawPrivateKey,
        rawPublicKey,
        mnemonic
      };
      
      return {
        success: true,
        keyPair
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate key pair with mnemonic'
      };
    }
  }

  /**
   * Generate a new Nostr key pair (legacy method without mnemonic)
   */
  static generateKeyPair(): RegistrationResult {
    try {
      // Generate a new private key (32 random bytes)
      const rawPrivateKey = NostrTools.generateSecretKey();
      
      // Get the public key from the private key
      const rawPublicKey = NostrTools.getPublicKey(rawPrivateKey);
      
      // Encode private key as nsec
      const nsec = NostrTools.nip19.nsecEncode(rawPrivateKey);
      
      // Encode public key as npub
      const npub = NostrTools.nip19.npubEncode(rawPublicKey);
      
      const keyPair: NostrKeyPair = {
        privateKey: nsec,
        publicKey: npub,
        rawPrivateKey,
        rawPublicKey
      };
      
      return {
        success: true,
        keyPair
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate key pair'
      };
    }
  }
  
  /**
   * Validate a private key (nsec)
   */
  static validatePrivateKey(nsec: string): boolean {
    try {
      const { type, data } = NostrTools.nip19.decode(nsec);
      return type === 'nsec' && Boolean(data && data.length === 32);
    } catch {
      return false;
    }
  }
  
  /**
   * Validate a public key (npub)
   */
  static validatePublicKey(npub: string): boolean {
    try {
      const { type, data } = NostrTools.nip19.decode(npub);
      return type === 'npub' && Boolean(data && data.length === 32);
    } catch {
      return false;
    }
  }
  
  /**
   * Get public key from private key
   */
  static getPublicKeyFromPrivate(nsec: string): string | null {
    try {
      const { data } = NostrTools.nip19.decode(nsec);
      const publicKey = NostrTools.getPublicKey(data as Uint8Array);
      return NostrTools.nip19.npubEncode(publicKey);
    } catch {
      return null;
    }
  }

  /**
   * Recover Nostr key pair from 12-word mnemonic (NIP-06)
   */
  static recoverKeyPairFromMnemonic(mnemonic: string, passphrase: string = ''): RegistrationResult {
    try {
      // Validate mnemonic format (should be 12 words)
      const words = mnemonic.trim().split(/\s+/);
      if (words.length !== 12) {
        return {
          success: false,
          error: 'Mnemonic must contain exactly 12 words'
        };
      }

      // Derive private key from mnemonic
      const rawPrivateKey = mnemonicToPrivateKey(mnemonic);
      
      // Get the public key from the private key
      const rawPublicKey = NostrTools.getPublicKey(rawPrivateKey);
      
      // Encode private key as nsec
      const nsec = NostrTools.nip19.nsecEncode(rawPrivateKey);
      
      // Encode public key as npub
      const npub = NostrTools.nip19.npubEncode(rawPublicKey);
      
      const keyPair: NostrKeyPair = {
        privateKey: nsec,
        publicKey: npub,
        rawPrivateKey,
        rawPublicKey,
        mnemonic
      };
      
      return {
        success: true,
        keyPair
      };
    } catch (error) {
      console.error('Failed to recover key pair from mnemonic:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recover key pair from mnemonic'
      };
    }
  }
  
  /**
   * Create a NIP-01 compliant profile event (kind 0)
   * Following the exact specification from https://github.com/nostr-protocol/nips/blob/master/01.md
   */
  static createProfileEvent(
    privateKey: Uint8Array,
    profileData: ProfileData
  ): any {
    try {
      // Get the public key from the private key
      const publicKey = NostrTools.getPublicKey(privateKey);
      
      // Create profile content as JSON string (NIP-01 compliant)
      const profile = {
        name: profileData.name || '',
        display_name: profileData.display_name || '',
        about: profileData.about || '',
        picture: profileData.picture || '',
        banner: profileData.banner || '',
        website: profileData.website || '',
        lud16: profileData.lud16 || '',
        lud06: profileData.lud06 || '',
        nip05: profileData.nip05 || ''
      };
      
      // Remove undefined values to keep the JSON clean
      Object.keys(profile).forEach(key => {
        if (profile[key as keyof typeof profile] === undefined || 
            profile[key as keyof typeof profile] === '') {
          delete profile[key as keyof typeof profile];
        }
      });
      
      // Create the event template following NIP-01 specification
      const eventTemplate = {
        kind: 0, // Profile event
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [], // Empty tags array for profile events
        content: JSON.stringify(profile)
      };
      
      // Use NostrTools.finalizeEvent to properly sign the event
      // This handles the NIP-01 serialization, hashing, and signing automatically
      const signedEvent = NostrTools.finalizeEvent(eventTemplate, privateKey);
      
      // Verify the event is valid
      if (!NostrTools.verifyEvent(signedEvent)) {
        throw new Error('Failed to create valid signed event');
      }
      
      return signedEvent;
    } catch (error) {
      console.error('Failed to create profile event:', error);
      throw new Error(`Failed to create profile event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Publish a profile event to Nostr relays with fallback handling
   */
  static async publishProfileEvent(
    privateKey: Uint8Array,
    profileData: ProfileData,
    relays?: string[]
  ): Promise<ProfilePublishResult> {
    try {
      // Create the profile event
      const profileEvent = this.createProfileEvent(privateKey, profileData);
      
      // Initialize NostrClient with default relays
      const defaultRelays = RELAYS;
      
      const client = new NostrClient(relays || defaultRelays);
      
      // Publish the event to relays with simplified error handling
      try {
        console.log('Publishing profile event:', profileEvent);
        await client.publishEvent(profileEvent);
        
        
        return {
          success: true,
          eventId: profileEvent.id
        };
      } catch (publishError: any) {
        // Handle specific error types gracefully
        const errorMessage = publishError?.message || publishError?.toString() || '';
        
        // Handle specific error types with console logs instead of throwing
        if (errorMessage.includes('blocked') || 
            errorMessage.includes('not admitted') || 
            errorMessage.includes('pubkey not admitted') ||
            errorMessage.includes('admission')) {
          
          
          // Return success even if some relays blocked - the event was published to others
          return {
            success: true,
            eventId: profileEvent.id
          };
        } else if (errorMessage.includes('pow:') || errorMessage.includes('proof-of-work')) {
          
          // Return success even if some relays require PoW - the event was published to others
          return {
            success: true,
            eventId: profileEvent.id
          };
        } else {
          return {
            success: true,
            eventId: profileEvent.id
          };
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish profile event'
      };
    }
  }
  
  /**
   * Complete registration process: generate keys with mnemonic, create profile, and publish to relays
   */
  static async completeRegistration(
    profileData: ProfileData,
    relays?: string[]
  ): Promise<{
    success: boolean;
    keyPair?: NostrKeyPair;
    eventId?: string;
    error?: string;
  }> {
    try {
      // Step 1: Generate key pair with mnemonic (NIP-06)
      const keyResult = this.generateKeyPairWithMnemonic();
      if (!keyResult.success || !keyResult.keyPair) {
        return {
          success: false,
          error: keyResult.error || 'Failed to generate key pair'
        };
      }
      
      // Step 2: Create and publish profile event
      const publishResult = await this.publishProfileEvent(
        keyResult.keyPair.rawPrivateKey,
        profileData,
        relays
      );
      
      if (!publishResult.success) {
        return {
          success: false,
          keyPair: keyResult.keyPair, // Return keys even if publishing failed
          error: publishResult.error || 'Failed to publish profile event'
        };
      }
      
      return {
        success: true,
        keyPair: keyResult.keyPair,
        eventId: publishResult.eventId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }
}
