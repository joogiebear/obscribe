<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\NotebookController;
use App\Http\Controllers\NoteController;

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'app' => 'obscribe-api']);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/notebooks', [NotebookController::class, 'index']);
    Route::post('/notebooks', [NotebookController::class, 'store']);

    Route::get('/notebooks/{id}/notes', [NoteController::class, 'index']);
    Route::post('/notebooks/{id}/notes', [NoteController::class, 'store']);
    Route::put('/notes/{id}', [NoteController::class, 'update']);
});
