const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { gql } = require('apollo-server-express/dist');
const mongoose = require('mongoose');
mongoose.set('strictQuery', false)
const { GraphQLError } = require('graphql');
const jwt = require('jsonwebtoken');
const { PubSub } = require('graphql-subscriptions');
const pubsub = new PubSub();
const { expressMiddleware } = require('@apollo/server/express4')
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const express = require('express')
const cors = require('cors')
const http = require('http')
const { WebSocketServer } = require('ws')
const { useServer } = require('graphql-ws/lib/use/ws')
const DataLoader = require('dataloader');

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

// DataLoader batch function for loading books count by author IDs
const batchBooksCount = async (authorIds) => {
    // Convert authorIds to ObjectIds
    const objectIds = authorIds.map((id) => new mongoose.Types.ObjectId(id));
    console.log(`Converted author IDs: ${objectIds.join(', ')}`);

    const books = await Book.aggregate([
        { $match: { author: { $in: objectIds } } },
        { $group: { _id: '$author', count: { $sum: 1 } } }
    ]);

    console.log('Aggregation result:', JSON.stringify(books));

    const bookCountMap = books.reduce((map, { _id, count }) => {
        map[_id.toString()] = count;
        return map;
    }, {});

    return authorIds.map((authorId) => bookCountMap[authorId.toString()] || 0);
};

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

  type Subscription {
    bookAdded: Book!
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
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
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
                await book.populate('author')
                pubsub.publish("BOOK_ADDED", { bookAdded: book })
                return book;
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
            if (!context.currentUser) {
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
        createUser: async (_, { username, favoriteGenre, passwordHash = "password" }) => {
            const user = await User.create({ username, favoriteGenre, passwordHash });
            return user;
        },
        login: async (root, args, context) => {
            const { username, password } = args;
            // Find the user with the provided username in the database
            const user = await User.findOne({ username });

            // If the user is not found or the password is incorrect, throw an error
            if (!user || password !== 'password') {
                throw new GraphQLError('Wrong credentials', {
                    extensions: {
                        code: 'BAD_USER_INPUT'
                    }
                });
            }

            // If the user is found and the password is correct, generate a JWT token
            const userForToken = {
                username: user.username,
                id: user._id,
            };
            const token = jwt.sign(userForToken, JWT_SECRET);

            // Return the token
            return { value: token };
        }
    },
    Subscription: {
        bookAdded: {
            subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
        }
    },
    Author: {
        bookCount: (author, args, context) => {
            return context.booksCountLoader.load(author.id);
        },
    },
};

const server = new ApolloServer({
    typeDefs,
    resolvers,
});

// setup is now within a function
const start = async () => {
    const app = express()
    const httpServer = http.createServer(app)

    const wsServer = new WebSocketServer({
        server: httpServer,
        path: '/',
    })

    const schema = makeExecutableSchema({ typeDefs, resolvers })
    const serverCleanup = useServer({ schema }, wsServer)

    const server = new ApolloServer({
        schema,
        plugins: [
            ApolloServerPluginDrainHttpServer({ httpServer }),
            {
                async serverWillStart() {
                    return {
                        async drainServer() {
                            await serverCleanup.dispose();
                        },
                    };
                },
            },
        ],
    })

    await server.start()

    app.use(
        '/',
        cors(),
        express.json(),
        expressMiddleware(server, {
            context: async ({ req, res }) => {
                // console.log("🚀 ~ context: ~ req:", req)
                const auth = req ? req.headers.authorization : null
                // console.log("🚀 ~ context: ~ auth:", auth)

                // Setup DataLoader for books count
                const booksCountLoader = new DataLoader(batchBooksCount);

                if (auth && auth.startsWith('Bearer ')) {
                    const decodedToken = jwt.verify(
                        auth.substring(7), process.env.JWT_SECRET
                    )
                    const currentUser = await User
                        .findById(decodedToken.id)
                    // console.log("🚀 ~ context: ~ currentUser:", currentUser)
                    return {
                        booksCountLoader, currentUser
                    }
                }
            },
        }),
    )

    const PORT = 4000

    httpServer.listen(PORT, () =>
        console.log(`Server is now running on http://localhost:${PORT}`)
    )
}

start()