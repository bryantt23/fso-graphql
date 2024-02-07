const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const mongoose = require('mongoose');
const Book = require("./models/book"); // Ensure these models exist and are correctly defined
const Author = require("./models/author");

require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('Connecting to', MONGODB_URI);

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((error) => {
        console.log('Error connecting to MongoDB:', error.message);
    });

const typeDefs = `
  type Book {
    title: String!
    published: Int
    author: Author!
    id: ID!
    genres: [String]!
  }

  type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int
  }

  type Query {
    bookCount: Int
    authorCount: Int
    allBooks(author: String, genre: String): [Book]
    allAuthors: [Author]
  }

  type Mutation {
    addBook(
      title: String!
      published: Int
      author: String!
      genres: [String]!
    ): Book
    editAuthor(
      name: String
      setBornTo: Int
    ): Author
  }
`;

const resolvers = {
    Query: {
        bookCount: () => Book.countDocuments(),
        authorCount: () => Author.countDocuments(),
        allBooks: async (_, args) => {
            let query = {};
            if (args.author) {
                const author = await Author.findOne({ name: args.author });
                query.author = author ? author._id : null;
            }
            if (args.genre) {
                query.genres = { $in: [args.genre] };
            }
            return Book.find(query).populate('author');
        },
        allAuthors: async () => {
            try {
                return await Author.find({});
            } catch (error) {
                console.error("Error fetching authors:", error);
                throw new Error(error);
            }
        },
    },
    Mutation: {
        addBook: async (_, args) => {
            const author = await Author.findOne({ name: args.author });
            if (!author) {
                throw new Error(`Author ${args.author} not found`);
            }
            const book = new Book({ ...args, author: author._id });
            await book.save();
            return book.populate('author');
        },
        editAuthor: async (_, args) => {
            const author = await Author.findOneAndUpdate({ name: args.name }, { born: args.setBornTo }, { new: true });
            return author;
        }
    },
    Author: {
        bookCount: async (author) => Book.countDocuments({ author: author._id }),
    }
};

const server = new ApolloServer({
    typeDefs,
    resolvers,
});

startStandaloneServer(server, { listen: { port: 4000 } }).then(({ url }) => {
    console.log(`Server ready at ${url}`);
});
