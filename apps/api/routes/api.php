<?php

use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

// Auth (Laravel will own this)
Route::prefix('auth')->group(function () {
    Route::post('/login', 'AuthController@login');
    Route::post('/register', 'AuthController@register');
    Route::post('/logout', 'AuthController@logout');

    // OAuth placeholders
    Route::get('/redirect/{provider}', 'OAuthController@redirect');
    Route::get('/callback/{provider}', 'OAuthController@callback');
});

// Notebooks
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/notebooks', 'NotebookController@index');
    Route::post('/notebooks', 'NotebookController@store');
});
