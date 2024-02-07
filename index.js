const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const jwt = require('jsonwebtoken');

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

const Book = require("./models/book"); // Ensure these models exist and are correctly defined
const Author = require("./models/author");
const User = require("./models/user");

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

  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Query {
    bookCount: Int
    authorCount: Int
    allBooks(author: String, genre: String): [Book]
    allAuthors: [Author]
    me: User
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
    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
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
            return await Author.find({});
        },
        me: async (_, __, { user }) => {
            if (!user) {
                throw new Error('You are not authenticated.');
            }
            return user;
        }
    },
    Mutation: {
        addBook: async (_, args) => {
            try {
                const author = await Author.findOne({ name: args.author });
                if (!author) {
                    throw new GraphQLError(`Author '${args.author}' not found`, {
                        invalidArgs: args.author,
                    });
                }
                const book = new Book({ ...args, author: author._id });
                await book.save();
                return book.populate('author');
            } catch (error) {
                if (error.name === 'ValidationError') {
                    const message = Object.values(error.errors).map(val => val.message).join(', ');
                    throw new GraphQLError(message, {
                        invalidArgs: Object.keys(error.errors),
                    });
                }
                throw error;
            }
        },
        editAuthor: async (_, args) => {
            try {
                const author = await Author.findOneAndUpdate({ name: args.name }, { born: args.setBornTo }, { new: true, runValidators: true });
                if (!author) {
                    throw new GraphQLError(`Author '${args.name}' not found`, {
                        invalidArgs: args.name,
                    });
                }
                return author;
            } catch (error) {
                if (error.name === 'ValidationError') {
                    const message = Object.values(error.errors).map(val => val.message).join(', ');
                    throw new GraphQLError(message, {
                        invalidArgs: Object.keys(error.errors),
                    });
                }
                throw error;
            }
        },
        createUser: async (_, { username, favoriteGenre }) => {
            const user = await User.create({ username, favoriteGenre });
            return user;
        },
        login: async (_, { username, password }) => {
            // Perform authentication here, for demonstration, just hardcoded
            if (username === 'exampleUser' && password === 'password') {
                const token = jwt.sign({ username }, process.env.JWT_SECRET);
                return { value: token };
            } else {
                throw new Error('Invalid credentials');
            }
        }
    },
    Author: {
        bookCount: async (author) => {
            return Book.countDocuments({ author: author._id });
        },
    }
};

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
        const token = req.headers.authorization || '';
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            return { user };
        } catch (error) {
            return { user: null };
        }
    }
});

startStandaloneServer(server, { listen: { port: 4000 } }).then(({ url }) => {
    console.log(`Server ready at ${url}`);
});
