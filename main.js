const express = require('express');
const path = require('path');
const xlsx = require('xlsx');
const natural = require('natural');
const multer = require('multer');

const upload = multer({ dest: '../uploads/' });
const app = express();
const port = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let data = [];
let unsplit = [];
let remov_stop_words = false;
let stemType = "lemm";
let invertedIndex = {};

app.post('/upload', upload.single('file'), (req, res) => {
    data=[]
    unsplit=[]
    const file = req.file;
    //remov_stop_words = req.body.removeStopWords;
    stemType = req.body.stemType;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = `../uploads/${file.filename}`;

    if (
        file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        // Parse Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        jsonData.forEach((row, index) => {
            if (index !== 0) {
                const parsedRow = {};
                row.forEach((cell, columnIndex) => {
                    const headerCell = jsonData[0][columnIndex];
                    parsedRow[headerCell] = cell;
                });
                data.push(parsedRow);
            }
        });
        data = data.filter(obj => Object.keys(obj).length !== 0);
        unsplit = JSON.parse(JSON.stringify(data));
        invertedIndex = process(data);
        return res.status(200).json({ message: 'file uploaded successfully' });
    }
});

app.post('/query', (req, res) => {
    const query = req.body.query;
    let calcQuery = JSON.parse(JSON.stringify(query));
    calcQuery = removePunctuation(calcQuery);
    calcQuery = splitDocs(calcQuery);
    calcQuery = preparerQueryUsingLimmatization(calcQuery);
    const ans = insertQuery(query, invertedIndex);
    let tempQuery = removePunctuation(query);
    tempQuery = splitDocs(tempQuery);
    const result = getDocumentContent(calcScore(ans, calcQuery));
    return res.status(200).json(result);
});

function getDocumentContent(scores) {
    const resultObject = {};
    unsplit.forEach(doc => {
        const content = doc.content;
        const id = doc.id;

        if (scores[id] !== undefined) {
            resultObject[content] = scores[id];
        }
    });
    return resultObject;
}


function removePunctuation(inputString) {
    const punctuation = /[!#$%&()*+,'"./:;<=>?@[\]^`{|}~]/g;
    var string = inputString.replace(punctuation, "");
    const dashes = /[-_]/g
    return string.replace(dashes, " ");
}
function removePunctuationforQuery(inputString) {
    const punctuation = /[!#$%&()*+,./:;<=>?@[\]^`{|}~]/g;
    var string = inputString.replace(punctuation, "");
    const dashes = /[-_]/g
    return string.replace(dashes, " ");
}

function process(data) {
    for (i = 0; i < data.length; i++) {
        data[i].content = removePunctuation(data[i].content);
        data[i].content = splitDocs(data[i].content);
        if (remov_stop_words)
            data[i].content = removeStopWords(data[i].content);
        if (stemType == "lemm")
            data[i].content = lemmatization(data[i].content);
        if (stemType == "stemm")
            data[i].content = stemmer(data[i].content)
    }
    invertedIndex = constructInvertedIndex(data);
    console.log("inverted index", invertedIndex);
    return invertedIndex;
}

function constructInvertedIndex(data) {
    invertedIndex = {};

    for (let i = 0; i < data.length; i++) {
        //terms in the document
        const terms = data[i].content;

        for (let j = 0; j < terms.length; j++) {
            const term = terms[j];
            if (!(term in invertedIndex)) {
                //docId,indexes
                invertedIndex[term] = new Map();
            }
            //document id that contain term
            const docId = data[i].id;
            const indexes = invertedIndex[term].get(docId) || [];
            //index of the term
            indexes.push(j);
            invertedIndex[term].set(docId, indexes);
        }
    }


    return invertedIndex;
}


function removeStopWords(content) {
    const stopWords = [
        "this", "is", "a", "with", "some", "the", "of", "in", "and", "to", "it", "that", "for", "you", "he", "she", "they",
        "we", "i", "me", "my", "mine", "you", "your", "yours", "his", "her", "hers", "its", "our", "ours", "theirs", "us",
        "them", "what", "who", "which", "whom", "whose", "when", "where", "why", "how", "about", "above", "across", "after",
        "against", "along", "among", "around", "before", "behind", "below", "beneath", "beside", "between", "beyond", "but",
        "by", "down", "during", "except", "for", "from", "in", "inside", "into", "near", "next", "of", "off", "on", "onto",
        "out", "outside", "over", "past", "since", "through", "throughout", "to", "toward", "under", "underneath", "until",
        "unto", "up", "upon", "with", "within", "without", "are"
    ];
    const filteredWords = content.filter(word => !stopWords.includes(word));
    return filteredWords;
}

function splitDocs(content) {
    content = content.toLowerCase();
    const words = content.split(" ");
    return words;
}
function lemmatization(terms) {
    const stemmer = natural.PorterStemmer;
    const lemmatizedTokens = terms.map(term => stemmer.stem(term));
    return lemmatizedTokens;
}

function stemmer(terms) {
    const stemmedArray = terms.map(word => stemWord(word));
    return stemmedArray;
}

function stemWord(word) {
    if (word.endsWith('sses')) {
        word = word.slice(0, -2);
    } else if (word.endsWith('ies')) {
        word = word.slice(0, -2);
    } else if (word.endsWith('s')) {
        word = word.slice(0, -1);
    }

    if (word.endsWith('eed')) {
        if (word.slice(0, -3).match(/[aeiouy]/)) {
            word = word.slice(0, -1);
        }
    } else if (word.endsWith('ing')) {
        if (word.slice(0, -3).match(/[aeiouy]/)) {
            word = word.slice(0, -3);
            if (word.endsWith('at') || word.endsWith('bl') || word.endsWith('iz')) {
                word += 'e';
            } else if (word.length >= 2 && word[word.length - 1] === word[word.length - 2] && !'aeiouy'.includes(word[word.length - 1])) {
                word = word.slice(0, -1);
            }
        }
    }
    if (word.endsWith('y')) {
        if (word.slice(0, -1).match(/[aeiou]/)) {
            word = word.slice(0, -1) + 'i';
        }
    }
    return word;
}

function insertQuery(query, invertedIndex) {
    query = removePunctuationforQuery(query);
    query = customSplit(query);
    console.log("quert terms", query);
    if (remov_stop_words){
        query = removeStopWords(query);
        console.log(query);}
    if (stemType != "none")
        query = preparerQueryUsingLimmatization(query);

    return searchResults(query, invertedIndex)


}

function OR(array1, array2) {
    return [...new Set([...array1, ...array2])];
}

function AND(array1, array2) {
    return array1.filter(doc => array2.includes(doc));
}

function customSplit(input) {
    const parts = [];
    let currentPart = '';
    let insideQuotes = false;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ' ' && !insideQuotes) {
            if (currentPart !== '') {
                parts.push(currentPart);
                currentPart = '';
            }
        } else {
            currentPart += char;
        }
    }
    if (currentPart !== '') {
        parts.push(currentPart);
    }
    return parts;
}

function preparerQueryUsingLimmatization(terms) {
    const lemmitazier = natural.PorterStemmer;
    for (let i = 0; i < terms.length; i++) {
        terms[i] = terms[i].toLowerCase();
        if (terms[i].toLowerCase() != "and" && terms[i].toLowerCase() != "or" && !terms[i].includes(" ")) {
            if (stemType == "lemm")
                terms[i] = lemmitazier.stem(terms[i]);
            else if (stemType == "stemm")
                terms[i] = stemWord(terms[i]);
        }
    }
    return terms
}

function searchResults(queryTerms, invertedIndex) {
    for (let i = 0; i < queryTerms.length; i++) {
        if (queryTerms[i].includes(" "))
            queryTerms[i] = findPhraseQueryResults(queryTerms[i], invertedIndex);
        else if (queryTerms[i] != "and" && queryTerms[i] != "or") {
            queryTerms[i] = Array.from(invertedIndex[queryTerms[i]]?.keys() || []);
            
        }
    }
    let result = [...queryTerms[0]];
    for (let i = 1; i < queryTerms.length; i++) {
        if (queryTerms[i] == "or") {
            result = OR(result, queryTerms[i + 1]);
            i++;
        }
        else if (queryTerms[i] == "and") {
            result = AND(result, queryTerms[i + 1])
            i++;
        }
        else result = AND(result, queryTerms[i])
    }
    return result;
}

function findPhraseQueryResults(phrase, invertedIndex) {
    let terms = phrase.split(" ");
    terms = preparerQueryUsingLimmatization(terms);
    let result = [];

    if (terms.length === 0) {
        return result;
    }

    const initialTerm = terms[0];
    const initialTermDocs = invertedIndex[initialTerm];

    if (!initialTermDocs) {
        return result;
    }

    const initialDocIds = Array.from(initialTermDocs.keys());

    for (const docId of initialDocIds) {
        const initialIndexes = initialTermDocs.get(docId);

        for (const initialIndex of initialIndexes) {
            let found = true;

            for (let i = 1; i < terms.length; i++) {
                const currentTerm = terms[i];
                const currentTermDocs = invertedIndex[currentTerm];

                if (!currentTermDocs || !currentTermDocs.has(docId)) {
                    found = false;
                    break;
                }

                const currentIndexes = currentTermDocs.get(docId);

                if (!currentIndexes.includes(initialIndex + i)) {
                    found = false;
                    break;
                }
            }

            if (found) {
                result.push(docId);
                break; // No need to check the same document again
            }
        }
    }

    return result;
}

function calcScore(docs, queryTerms) {
    let answer = {};

    for (let i = 0; i < docs.length; i++) {
        const docId = docs[i];
        const document = data.find(item => item.id === docId);

        if (document) {
            const jaccardScore = jaccardSimilarity(document.content, queryTerms);
            answer[docId] = jaccardScore;
        } else {
            answer[docId] = null;
        }
    }

    return answer;
}

function jaccardSimilarity(docTerms, queryTerms) {
    const intersection = docTerms.filter(term => queryTerms.includes(term));
    const union = [...new Set([...docTerms, ...queryTerms])];
    const jaccardScore = intersection.length / union.length;
    return jaccardScore;
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);

});


