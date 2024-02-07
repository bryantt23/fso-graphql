const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { gql } = require('apollo-server-express/dist');
const mongoose = require('mongoose');
mongoose.set('strictQuery', false)
const { GraphQLError } = require('graphql');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
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

const typeDefs = gql`
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
        me: (root, args, context) => {
            return context.currentUser
        }
    },
    Mutation: {
        addBook: async (_, args, context) => {
            console.log("🚀 ~ addBook: ~ context:", context)
            // Check if user is authenticated
            if (!context.user) {
                throw new Error('Authentication required.');
            }
            console.log('Context user:', context.user); // Add this console log to print the user from context
            console.log('Received args:', args); // Add this console log to print the received arguments
            try {
                const author = await Author.findOne({ name: args.author });
                if (!author) {
                    throw new GraphQLError(`Author '${args.author}' not found`, {
                        invalidArgs: args.author,
                    });
                }
                const book = new Book({ ...args, author: author._id });
                await book.save();
                console.log('Saved book:', book); // Add this console log to print the saved book
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
        editAuthor: async (_, args, context) => {
            // Check if user is authenticated
            if (!context.user) {
                throw new Error('Authentication required.');
            }
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
        login: async (root, args, context) => {
            console.log("🚀 ~ login: ~ args:", args)
            if (args.username !== 'exampleUser' || args.password !== 'password') {
                throw new GraphQLError('wrong credentials', {
                    extensions: {
                        code: 'BAD_USER_INPUT'
                    }
                })
            }

            const user = await User.findOne({ username: args.username })
            console.log("🚀 ~ login: ~ user:", user)

            const userForToken = {
                username: args.username,
                id: user._id,
            }
            console.log("🚀 ~ login: ~ userForToken:", userForToken)

            return { value: jwt.sign(userForToken, JWT_SECRET) }
        },
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
});

startStandaloneServer(server, {
    listen: { port: 4000 },

    context: async ({ req, res }) => {
        // console.log("🚀 ~ context: ~ req:", req)
        const auth = req ? req.headers.authorization : null
        // console.log("🚀 ~ context: ~ auth:", auth)
        if (auth && auth.startsWith('Bearer ')) {
            const decodedToken = jwt.verify(
                auth.substring(7), process.env.JWT_SECRET
            )
            const currentUser = await User
                .findById(decodedToken.id)
            // console.log("🚀 ~ context: ~ currentUser:", currentUser)
            return { currentUser }
        }
    },
}).then(({ url }) => {
    console.log(`Server ready at ${url}`)
})