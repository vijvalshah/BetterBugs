package database

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Database struct {
	Client   *mongo.Client
	DB       *mongo.Database
	Sessions *mongo.Collection
	Events   *mongo.Collection
	Projects *mongo.Collection
	UploadSessions *mongo.Collection
	AuditLogs *mongo.Collection
}

func Connect(uri, dbName string) (*Database, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	// Ping to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	db := client.Database(dbName)

	return &Database{
		Client:   client,
		DB:       db,
		Sessions: db.Collection("sessions"),
		Events:   db.Collection("events"),
		Projects: db.Collection("projects"),
		UploadSessions: db.Collection("upload_sessions"),
		AuditLogs: db.Collection("audit_logs"),
	}, nil
}

func (d *Database) Disconnect() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return d.Client.Disconnect(ctx)
}
