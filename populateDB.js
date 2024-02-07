require('dotenv').config();
const mongoose = require('mongoose');
const Book = require('./models/book'); // Adjust the path as necessary
const Author = require('./models/author'); // Adjust the path as necessary

const MONGODB_URI = process.env.MONGODB_URI;

console.log('Connecting to MongoDB');

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        return populateDatabase();
    })
    .catch((error) => {
        console.log('Error connecting to MongoDB:', error.message);
    });

const authors = [
    {
        name: 'Robert Martin',
        id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
        born: 1952,
    },
    {
        name: 'Martin Fowler',
        id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
        born: 1963
    },
    {
        name: 'Fyodor Dostoevsky',
        id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
        born: 1821
    },
    {
        name: 'Joshua Kerievsky', // birthyear not known
        id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
    },
    {
        name: 'Sandi Metz', // birthyear not known
        id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
    },
]

const books = [
    {
        title: 'Clean Code',
        published: 2008,
        author: 'Robert Martin',
        id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring']
    },
    {
        title: 'Agile software development',
        published: 2002,
        author: 'Robert Martin',
        id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
        genres: ['agile', 'patterns', 'design']
    },
    {
        title: 'Refactoring, edition 2',
        published: 2018,
        author: 'Martin Fowler',
        id: "afa5de00-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring']
    },
    {
        title: 'Refactoring to patterns',
        published: 2008,
        author: 'Joshua Kerievsky',
        id: "afa5de01-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring', 'patterns']
    },
    {
        title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
        published: 2012,
        author: 'Sandi Metz',
        id: "afa5de02-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring', 'design']
    },
    {
        title: 'Crime and punishment',
        published: 1866,
        author: 'Fyodor Dostoevsky',
        id: "afa5de03-344d-11e9-a414-719c6709cf3e",
        genres: ['classic', 'crime']
    },
    {
        title: 'The Demon ',
        published: 1872,
        author: 'Fyodor Dostoevsky',
        id: "afa5de04-344d-11e9-a414-719c6709cf3e",
        genres: ['classic', 'revolution']
    },
]

async function createAuthor(author) {
    const newAuthor = new Author(author);
    await newAuthor.save();
}

async function createBook(book) {
    const author = await Author.findOne({ name: book.author });
    if (!author) {
        console.error(`Author ${book.author} not found.`);
        return;
    }
    const newBook = new Book({
        ...book,
        author: author._id, // Assuming book model uses author ID
    });
    await newBook.save();
}

async function populateDatabase() {
    try {
        await Author.deleteMany({});
        await Book.deleteMany({});

        for (const author of authors) {
            await createAuthor(author);
        }

        for (const book of books) {
            await createBook(book);
        }

        console.log('Database populated successfully');
        mongoose.connection.close();
    } catch (error) {
        console.error('Failed to populate database:', error);
        mongoose.connection.close();
    }
}
