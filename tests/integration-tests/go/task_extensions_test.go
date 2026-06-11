package integration_tests

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func OrTimeout(task func() error, millisecondsDelay int) error {
	timeout := time.After(time.Duration(millisecondsDelay) * time.Millisecond)
	done := make(chan error, 1)

	go func() {
		done <- task()
	}()

	select {
	case err := <-done:
		return err
	case <-timeout:
		return errors.New("timeout")
	}
}

func TestOrTimeout(t *testing.T) {
	task := func() error {
		time.Sleep(1 * time.Second)
		return nil
	}

	err := OrTimeout(task, 500)
	assert.NotNil(t, err)
	assert.Equal(t, "timeout", err.Error())

	err = OrTimeout(task, 2000)
	assert.Nil(t, err)
}
